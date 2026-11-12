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
import { X, Trash2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { deleteAppUser } from "@/lib/users.functions";
import type { AppRole } from "@/hooks/use-current-user";
import { roleLabel, useCurrentUser } from "@/hooks/use-current-user";

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
  const { data: studentRecs } = useQuery({
    queryKey: ["link-students"],
    queryFn: async () => ((await supabase.from("students").select("id, first_name, last_name, student_code, profile_id").order("first_name").range(0, 9999)).data ?? [])
      .map((s) => ({ id: s.id, first_name: s.first_name, last_name: s.last_name, code: s.student_code, profile_id: s.profile_id })),
  });
  const { data: staffRecs } = useQuery({
    queryKey: ["link-staff"],
    queryFn: async () => ((await supabase.from("staff").select("id, first_name, last_name, staff_code, profile_id").order("first_name").range(0, 9999)).data ?? [])
      .map((s) => ({ id: s.id, first_name: s.first_name, last_name: s.last_name, code: s.staff_code, profile_id: s.profile_id })),
  });

  async function linkRecord(userId: string, target: string) {
    // One login ↔ one record: clear any existing link for this user first.
    const a = await supabase.from("students").update({ profile_id: null }).eq("profile_id", userId);
    const b = await supabase.from("staff").update({ profile_id: null }).eq("profile_id", userId);
    if (a.error || b.error) return toast.error((a.error ?? b.error)!.message);
    if (target !== "none") {
      const [kind, id] = target.split(":");
      const { error } = await supabase.from(kind === "student" ? "students" : "staff").update({ profile_id: userId }).eq("id", id);
      if (error) return toast.error(error.message);
      toast.success(`Linked to ${kind} record`);
    } else {
      toast.success("Record unlinked");
    }
    qc.invalidateQueries({ queryKey: ["link-students"] });
    qc.invalidateQueries({ queryKey: ["link-staff"] });
    qc.invalidateQueries({ queryKey: ["students"] });
    qc.invalidateQueries({ queryKey: ["staff"] });
  }


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

  const { data: me } = useCurrentUser();
  const removeUser = useServerFn(deleteAppUser);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; label: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function confirmDelete() {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await removeUser({ data: { userId: pendingDelete.id } });
      toast.success("User deleted");
      setPendingDelete(null);
      qc.invalidateQueries({ queryKey: ["all-profiles"] });
      qc.invalidateQueries({ queryKey: ["all-roles"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not delete user");
    } finally {
      setDeleting(false);
    }
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
              <TableHead>Linked record</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={6}  className="py-8 text-center text-sm text-muted-foreground">Loading…</TableCell></TableRow>}

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
                          <Badge key={r.id} variant="outline" className={`gap-1.5 ${roleTone(r.role).badge}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${roleTone(r.role).dot}`} />
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
                    <TableCell>
                      <RecordLinker userId={p.id} students={studentRecs ?? []} staff={staffRecs ?? []} onLink={(t) => linkRecord(p.id, t)} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Delete ${p.full_name ?? p.email ?? "user"}`}
                        disabled={p.id === me?.userId}
                        onClick={() => setPendingDelete({ id: p.id, label: p.full_name ?? p.email ?? "this user" })}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>

                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => { if (!o && !deleting) setPendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this user?</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDelete?.label} will be permanently removed, along with their login, profile and all assigned roles.
              Linked student or staff records are kept but unlinked. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={deleting} onClick={(e) => { e.preventDefault(); confirmDelete(); }}>
              {deleting ? "Deleting…" : "Delete user"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>



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

type RecordOpt = { id: string; first_name: string; last_name: string; code: string; profile_id: string | null };

function RecordLinker({
  userId, students, staff, onLink,
}: {
  userId: string;
  students: RecordOpt[];
  staff: RecordOpt[];
  onLink: (target: string) => void;
}) {
  const linkedStudent = students.find((s) => s.profile_id === userId);
  const linkedStaff = staff.find((s) => s.profile_id === userId);
  const value = linkedStudent ? `student:${linkedStudent.id}` : linkedStaff ? `staff:${linkedStaff.id}` : "none";
  const freeStudents = students.filter((s) => !s.profile_id || s.profile_id === userId);
  const freeStaff = staff.filter((s) => !s.profile_id || s.profile_id === userId);
  return (
    <Select value={value} onValueChange={onLink}>
      <SelectTrigger className="w-56" aria-label="Link student or staff record"><SelectValue /></SelectTrigger>
      <SelectContent className="max-h-80">
        <SelectItem value="none">— not linked —</SelectItem>
        {freeStaff.length > 0 && <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">Staff</div>}
        {freeStaff.map((s) => (
          <SelectItem key={s.id} value={`staff:${s.id}`}>{s.first_name} {s.last_name} · {s.code}</SelectItem>
        ))}
        {freeStudents.length > 0 && <div className="px-2 py-1 text-xs font-semibold text-muted-foreground">Students</div>}
        {freeStudents.map((s) => (
          <SelectItem key={s.id} value={`student:${s.id}`}>{s.first_name} {s.last_name} · {s.code}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function RoleAssigner({ onAssign }: { onAssign: (role: AppRole) => void }) {
  return (
    <div className="flex gap-1">
      <Select onValueChange={(v) => onAssign(v as AppRole)}>
        <SelectTrigger className="w-44"><SelectValue placeholder="+ grant role" /></SelectTrigger>
        <SelectContent>
          {ROLES.map((r) => <SelectItem key={r} value={r}><span className="flex items-center gap-2"><span className={`h-2 w-2 rounded-full ${roleTone(r).dot}`} />{roleLabel(r)}</span></SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

// Suppress unused
const _ = Button;

const ROLE_TONES: Record<string, { badge: string; dot: string }> = {
  super_admin: { badge: "border-primary/40 bg-primary/10 text-primary", dot: "bg-primary" },
  campus_admin: { badge: "border-oxford/40 bg-oxford/10 text-oxford dark:text-foreground", dot: "bg-oxford" },
  finance_officer: { badge: "border-success/40 bg-success/10 text-success", dot: "bg-success" },
  admissions_officer: { badge: "border-warning/50 bg-warning/15 text-foreground", dot: "bg-warning" },
  teacher: { badge: "border-gold/50 bg-gold/15 text-foreground", dot: "bg-gold" },
  student: { badge: "border-border bg-muted text-muted-foreground", dot: "bg-muted-foreground" },
};
function roleTone(role: string) {
  return ROLE_TONES[role] ?? ROLE_TONES.student;
}
