import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { generateCode } from "@/lib/generate-code";

export const Route = createFileRoute("/_authenticated/campuses")({
  component: CampusesPage,
});

type Campus = {
  id: string;
  name: string;
  code: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  academic_system: "board" | "cambridge" | "both";
};

function CampusesPage() {
  const qc = useQueryClient();
  const { data: user } = useCurrentUser();
  const isSuper = user?.roles.includes("super_admin");
  const [editing, setEditing] = useState<Campus | null>(null);
  const [open, setOpen] = useState(false);

  const { data: campuses, isLoading } = useQuery({
    queryKey: ["campuses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("campuses").select("*").order("name");
      if (error) throw error;
      return data as Campus[];
    },
  });

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name"));
    let code = String(fd.get("code") || "").trim().toUpperCase();
    if (!code) code = generateCode(name, (campuses ?? []).map((c) => c.code));
    const payload = {
      name,
      code,
      address: String(fd.get("address") || "") || null,
      phone: String(fd.get("phone") || "") || null,
      email: String(fd.get("email") || "") || null,
      academic_system: String(fd.get("academic_system")) as Campus["academic_system"],
    };
    const res = editing
      ? await supabase.from("campuses").update(payload).eq("id", editing.id)
      : await supabase.from("campuses").insert(payload);
    if (res.error) return toast.error(res.error.message);
    toast.success(editing ? "Campus updated" : "Campus created");
    setOpen(false);
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["campuses"] });
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this campus? All related records will be affected.")) return;
    const { error } = await supabase.from("campuses").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Campus deleted");
    qc.invalidateQueries({ queryKey: ["campuses"] });
  }

  return (
    <>
      <PageHeader
        eyebrow="Institution"
        title="Campuses"
        description="Each campus operates under one academic system: Pakistani Board (BISE), Cambridge (O/A-Level), or both."
        actions={isSuper && (
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-1 h-4 w-4" /> New campus</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-serif">{editing ? "Edit campus" : "New campus"}</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input name="name" defaultValue={editing?.name} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Code</Label>
                    <Input name="code" defaultValue={editing?.code} maxLength={16} placeholder="Auto from name" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Address</Label>
                  <Input name="address" defaultValue={editing?.address ?? ""} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Phone</Label>
                    <Input name="phone" defaultValue={editing?.phone ?? ""} />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input name="email" type="email" defaultValue={editing?.email ?? ""} />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Academic system</Label>
                  <Select name="academic_system" defaultValue={editing?.academic_system ?? "board"}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="board">Board (Matric / Inter · BISE)</SelectItem>
                      <SelectItem value="cambridge">Cambridge (O-Level / A-Level)</SelectItem>
                      <SelectItem value="both">Both</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <DialogFooter>
                  <Button type="submit">{editing ? "Save changes" : "Create campus"}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      />

      <Card className="shadow-none">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>System</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">Loading…</TableCell></TableRow>}
              {campuses?.length === 0 && <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">No campuses yet. Create one to begin.</TableCell></TableRow>}
              {campuses?.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell><code className="rounded bg-muted px-1.5 py-0.5 text-xs">{c.code}</code></TableCell>
                  <TableCell><SystemBadge system={c.academic_system} /></TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    <div>{c.email ?? "—"}</div>
                    <div className="text-xs">{c.phone ?? ""}</div>
                  </TableCell>
                  <TableCell className="text-right">
                    {isSuper && (
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" onClick={() => { setEditing(c); setOpen(true); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => handleDelete(c.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

export function SystemBadge({ system }: { system: "board" | "cambridge" | "both" | null | undefined }) {
  const map = {
    board: { label: "Board", cls: "bg-primary/10 text-primary" },
    cambridge: { label: "Cambridge", cls: "bg-accent text-accent-foreground" },
    both: { label: "Board + Cambridge", cls: "bg-secondary text-secondary-foreground" },
  } as const;
  const m = (system && map[system]) || { label: "—", cls: "bg-muted text-muted-foreground" };
  return <Badge variant="outline" className={m.cls + " border-transparent"}>{m.label}</Badge>;
}

