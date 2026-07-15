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
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { SystemBadge } from "./campuses";
import { generateCode } from "@/lib/generate-code";

export const Route = createFileRoute("/_authenticated/programs")({
  component: ProgramsPage,
});

type Program = {
  id: string;
  campus_id: string;
  name: string;
  code: string;
  description: string | null;
  duration_years: number | null;
  academic_system: "board" | "cambridge" | "both";
};

function ProgramsPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Program | null>(null);
  const [open, setOpen] = useState(false);

  const { data: campuses } = useQuery({
    queryKey: ["campuses"],
    queryFn: async () => (await supabase.from("campuses").select("id, name, academic_system").order("name")).data ?? [],
  });

  const { data: programs, isLoading } = useQuery({
    queryKey: ["programs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("programs").select("*").order("name");
      if (error) throw error;
      return data as Program[];
    },
  });

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const name = String(fd.get("name"));
    let code = String(fd.get("code") || "").trim().toUpperCase();
    if (!code) code = generateCode(name, (programs ?? []).map((p) => p.code));
    const payload = {
      campus_id: String(fd.get("campus_id")),
      name,
      code,
      description: String(fd.get("description") || "") || null,
      duration_years: Number(fd.get("duration_years") || 2),
      academic_system: String(fd.get("academic_system")) as Program["academic_system"],
    };
    const res = editing
      ? await supabase.from("programs").update(payload).eq("id", editing.id)
      : await supabase.from("programs").insert(payload);
    if (res.error) return toast.error(res.error.message);
    toast.success(editing ? "Program updated" : "Program created");
    setOpen(false); setEditing(null);
    qc.invalidateQueries({ queryKey: ["programs"] });
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this program?")) return;
    const { error } = await supabase.from("programs").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["programs"] });
  }

  const campusMap = new Map(campuses?.map((c) => [c.id, c.name]));

  return (
    <>
      <PageHeader
        eyebrow="Curriculum"
        title="Programs"
        description="Programs group classes into a coherent qualification (e.g. Matriculation Science, A-Level Sciences)."
        actions={
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-1 h-4 w-4" /> New program</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle className="font-serif">{editing ? "Edit program" : "New program"}</DialogTitle></DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label>Campus</Label>
                  <Select name="campus_id" defaultValue={editing?.campus_id} required>
                    <SelectTrigger><SelectValue placeholder="Select campus" /></SelectTrigger>
                    <SelectContent>
                      {campuses?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input name="name" defaultValue={editing?.name} required />
                  </div>
                  <div className="space-y-2">
                    <Label>Code</Label>
                    <Input name="code" defaultValue={editing?.code} required />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Duration (years)</Label>
                    <Input name="duration_years" type="number" min={1} max={6} defaultValue={editing?.duration_years ?? 2} />
                  </div>
                  <div className="space-y-2">
                    <Label>Academic system</Label>
                    <Select name="academic_system" defaultValue={editing?.academic_system ?? "board"}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="board">Board</SelectItem>
                        <SelectItem value="cambridge">Cambridge</SelectItem>
                        <SelectItem value="both">Both</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Description</Label>
                  <Input name="description" defaultValue={editing?.description ?? ""} />
                </div>
                <DialogFooter><Button type="submit">{editing ? "Save" : "Create"}</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <Card className="shadow-none">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Program</TableHead>
                <TableHead>Code</TableHead>
                <TableHead>Campus</TableHead>
                <TableHead>System</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">Loading…</TableCell></TableRow>}
              {programs?.length === 0 && <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">No programs yet.</TableCell></TableRow>}
              {programs?.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell><code className="rounded bg-muted px-1.5 py-0.5 text-xs">{p.code}</code></TableCell>
                  <TableCell className="text-sm">{campusMap.get(p.campus_id) ?? "—"}</TableCell>
                  <TableCell><SystemBadge system={p.academic_system} /></TableCell>
                  <TableCell className="text-sm">{p.duration_years} yr</TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => { setEditing(p); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => handleDelete(p.id)}><Trash2 className="h-4 w-4" /></Button>
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
