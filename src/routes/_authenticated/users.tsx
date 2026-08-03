import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { X } from "lucide-react";
import type { AppRole } from "@/hooks/use-current-user";
import { roleLabel } from "@/hooks/use-current-user";

export const Route = createFileRoute("/_authenticated/users")({
  component: UsersPage,
});

const ROLES: AppRole[] = ["super_admin", "campus_admin", "admissions_officer", "finance_officer", "teacher", "student"];

function UsersPage() {
  const qc = useQueryClient();

  const { data: profiles, isLoading } = useQuery({
    queryKey: ["all-profiles"],
    queryFn: async () => (await supabase.from("profiles").select("id, full_name, email, campus_id").order("created_at", { ascending: false })).data ?? [],
  });
  const { data: roles } = useQuery({
    queryKey: ["all-roles"],
    queryFn: async () => (await supabase.from("user_roles").select("id, user_id, role, campus_id")).data ?? [],
  });
  const { data: campuses } = useQuery({
    queryKey: ["campuses"],
    queryFn: async () => (await supabase.from("campuses").select("id, name").order("name")).data ?? [],
  });

  const campusMap = new Map(campuses?.map((c) => [c.id, c.name]));
  const rolesByUser = new Map<string, typeof roles>();
  roles?.forEach((r) => {
    const arr = rolesByUser.get(r.user_id) ?? [];
    arr.push(r);
    rolesByUser.set(r.user_id, arr);
  });

  async function assignRole(userId: string, role: AppRole, campusId: string | null) {
    const { error } = await supabase.from("user_roles").insert({ user_id: userId, role, campus_id: campusId });
    if (error) return toast.error(error.message);
    toast.success(`Granted ${roleLabel(role)}`);
    qc.invalidateQueries({ queryKey: ["all-roles"] });
  }
  const [pendingRevoke, setPendingRevoke] = useState<{ id: string; label: string; userLabel: string } | null>(null);
  const [confirmStep, setConfirmStep] = useState(1);

  async function revokeRole(id: string) {
    const { error } = await supabase.from("user_roles").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Role revoked");
    qc.invalidateQueries({ queryKey: ["all-roles"] });
  }

  function requestRevoke(r: { id: string; role: string }, userLabel: string) {
    if (r.role === "super_admin") {
      setConfirmStep(1);
      setPendingRevoke({ id: r.id, label: roleLabel(r.role as AppRole), userLabel });
      return;
    }
    revokeRole(r.id);
  }

  async function proceedRevoke() {
    if (!pendingRevoke) return;
    if (confirmStep === 1) {
      setConfirmStep(2);
      return;
    }
    const target = pendingRevoke;
    setPendingRevoke(null);
    setConfirmStep(1);
    await revokeRole(target.id);
  }

  async function updateCampus(userId: string, campusId: string | null) {
    const { error } = await supabase.from("profiles").update({ campus_id: campusId }).eq("id", userId);
    if (error) return toast.error(error.message);
    toast.success("Campus updated");
    qc.invalidateQueries({ queryKey: ["all-profiles"] });
  }

  return (
    <>
      <PageHeader
        eyebrow="Access"
        title="Users & Roles"
        description="Only Super Admins can grant or revoke roles. Each user may hold multiple roles across campuses."
      />

      <Card className="shadow-none">
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>User</TableHead><TableHead>Campus</TableHead>
              <TableHead>Roles</TableHead><TableHead>Assign role</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">Loading…</TableCell></TableRow>}
              {profiles?.map((p) => {
                const userRoles = rolesByUser.get(p.id) ?? [];
                return (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="font-medium">{p.full_name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{p.email}</div>
                    </TableCell>
                    <TableCell>
                      <Select value={p.campus_id ?? "none"} onValueChange={(v) => updateCampus(p.id, v === "none" ? null : v)}>
                        <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">— unassigned —</SelectItem>
                          {campuses?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {userRoles.length === 0 && <span className="text-xs text-muted-foreground">No roles</span>}
                        {userRoles.map((r) => (
                          <Badge key={r.id} variant="secondary" className="gap-1">
                            {roleLabel(r.role as AppRole)}
                            {r.campus_id && <span className="opacity-60">· {campusMap.get(r.campus_id)}</span>}
                            <button onClick={() => requestRevoke(r, p.full_name ?? p.email ?? "this user")} className="ml-1 hover:text-destructive">
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <RoleAssigner onAssign={(role) => assignRole(p.id, role, p.campus_id)} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog open={!!pendingRevoke} onOpenChange={(o) => { if (!o) { setPendingRevoke(null); setConfirmStep(1); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmStep === 1 ? "Remove Super Admin access?" : "Final confirmation required"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmStep === 1
                ? `You are about to revoke the Super Admin role from ${pendingRevoke?.userLabel}. Super Admins control every campus and tenant setting.`
                : `This is the second and final confirmation. ${pendingRevoke?.userLabel} will immediately lose platform-wide administrative access.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); proceedRevoke(); }}>
              {confirmStep === 1 ? "Continue" : "Yes, revoke Super Admin"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>

  );
}

function RoleAssigner({ onAssign }: { onAssign: (role: AppRole) => void }) {
  return (
    <div className="flex gap-1">
      <Select onValueChange={(v) => onAssign(v as AppRole)}>
        <SelectTrigger className="w-44"><SelectValue placeholder="+ grant role" /></SelectTrigger>
        <SelectContent>
          {ROLES.map((r) => <SelectItem key={r} value={r}>{roleLabel(r)}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

// Suppress unused
const _ = Button;
