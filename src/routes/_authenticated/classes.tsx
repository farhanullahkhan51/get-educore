import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { SystemBadge } from "./campuses";

export const Route = createFileRoute("/_authenticated/classes")({
  component: ClassesPage,
});

type Klass = {
  id: string;
  campus_id: string;
  program_id: string | null;
  name: string;
  grade_level: string | null;
  academic_system: "board" | "cambridge" | "both";
  academic_year: string | null;
};
type Section = {
  id: string; campus_id: string; class_id: string; name: string;
  capacity: number | null; room: string | null;
  academic_system: "board" | "cambridge" | "both";
};

function ClassesPage() {
  const qc = useQueryClient();
  const [openCls, setOpenCls] = useState(false);
  const [openSec, setOpenSec] = useState<string | null>(null);

  const { data: campuses } = useQuery({
    queryKey: ["campuses"],
    queryFn: async () => (await supabase.from("campuses").select("id, name").order("name")).data ?? [],
  });
  const { data: programs } = useQuery({
    queryKey: ["programs"],
    queryFn: async () => (await supabase.from("programs").select("id, name, campus_id").order("name")).data ?? [],
  });
  const { data: classes } = useQuery({
    queryKey: ["classes"],
    queryFn: async () => (await supabase.from("classes").select("*").order("name")).data as Klass[] | null,
  });
  const { data: sections } = useQuery({
    queryKey: ["sections"],
    queryFn: async () => (await supabase.from("sections").select("*").order("name")).data as Section[] | null,
  });

  const campusMap = new Map(campuses?.map((c) => [c.id, c.name]));

  async function createClass(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = {
      campus_id: String(fd.get("campus_id")),
      program_id: (fd.get("program_id") as string) || null,
      name: String(fd.get("name")),
      grade_level: String(fd.get("grade_level") || "") || null,
      academic_year: String(fd.get("academic_year") || "") || null,
      academic_system: String(fd.get("academic_system")) as Klass["academic_system"],
    };
    const { error } = await supabase.from("classes").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Class created");
    setOpenCls(false);
    qc.invalidateQueries({ queryKey: ["classes"] });
  }

  async function createSection(cls: Klass, e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const { error } = await supabase.from("sections").insert({
      campus_id: cls.campus_id,
      class_id: cls.id,
      name: String(fd.get("name")),
      capacity: Number(fd.get("capacity") || 40),
      room: String(fd.get("room") || "") || null,
      academic_system: cls.academic_system,
    });
    if (error) return toast.error(error.message);
    toast.success("Section added");
    setOpenSec(null);
    qc.invalidateQueries({ queryKey: ["sections"] });
  }

  async function delClass(id: string) {
    if (!confirm("Delete this class and its sections?")) return;
    const { error } = await supabase.from("classes").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["classes"] });
    qc.invalidateQueries({ queryKey: ["sections"] });
  }
  async function delSection(id: string) {
    if (!confirm("Delete this section?")) return;
    const { error } = await supabase.from("sections").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["sections"] });
  }

  return (
    <>
      <PageHeader
        eyebrow="Structure"
        title="Classes & Sections"
        description="Classes are grade groups (e.g. Grade 9, O-Level Year 1). Each class can have multiple sections."
        actions={
          <Dialog open={openCls} onOpenChange={setOpenCls}>
            <DialogTrigger asChild><Button><Plus className="mr-1 h-4 w-4" /> New class</Button></DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle className="font-serif">New class</DialogTitle></DialogHeader>
              <form onSubmit={createClass} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Campus</Label>
                    <Select name="campus_id" required>
                      <SelectTrigger><SelectValue placeholder="Campus" /></SelectTrigger>
                      <SelectContent>{campuses?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Program (optional)</Label>
                    <Select name="program_id">
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>{programs?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input name="name" placeholder="Grade 9" required />
                  </div>
                  <div className="space-y-2">
                    <Label>Grade level</Label>
                    <Input name="grade_level" placeholder="9 / O-1 / A-2" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Academic year</Label>
                    <Input name="academic_year" placeholder="2025-2026" />
                  </div>
                  <div className="space-y-2">
                    <Label>System</Label>
                    <Select name="academic_system" defaultValue="board">
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="board">Board</SelectItem>
                        <SelectItem value="cambridge">Cambridge</SelectItem>
                        <SelectItem value="both">Both</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <DialogFooter><Button type="submit">Create class</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <div className="space-y-4">
        {classes?.length === 0 && (
          <Card className="shadow-none"><CardContent className="py-8 text-center text-sm text-muted-foreground">No classes yet.</CardContent></Card>
        )}
        {classes?.map((cls) => {
          const clsSections = sections?.filter((s) => s.class_id === cls.id) ?? [];
          return (
            <Card key={cls.id} className="shadow-none">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <div>
                  <CardTitle className="font-serif text-lg">{cls.name}</CardTitle>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{campusMap.get(cls.campus_id)}</span>
                    <span>·</span>
                    <span>{cls.academic_year ?? "—"}</span>
                    <SystemBadge system={cls.academic_system} />
                  </div>
                </div>
                <div className="flex gap-1">
                  <Dialog open={openSec === cls.id} onOpenChange={(o) => setOpenSec(o ? cls.id : null)}>
                    <DialogTrigger asChild><Button size="sm" variant="outline"><Plus className="mr-1 h-3 w-3" /> Section</Button></DialogTrigger>
                    <DialogContent>
                      <DialogHeader><DialogTitle className="font-serif">Add section to {cls.name}</DialogTitle></DialogHeader>
                      <form onSubmit={(e) => createSection(cls, e)} className="space-y-4">
                        <div className="grid grid-cols-3 gap-3">
                          <div className="space-y-2">
                            <Label>Name</Label>
                            <Input name="name" placeholder="A" required />
                          </div>
                          <div className="space-y-2">
                            <Label>Capacity</Label>
                            <Input name="capacity" type="number" defaultValue={40} />
                          </div>
                          <div className="space-y-2">
                            <Label>Room</Label>
                            <Input name="room" placeholder="Room 101" />
                          </div>
                        </div>
                        <DialogFooter><Button type="submit">Add section</Button></DialogFooter>
                      </form>
                    </DialogContent>
                  </Dialog>
                  <Button size="icon" variant="ghost" onClick={() => delClass(cls.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </CardHeader>
              <CardContent>
                {clsSections.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No sections yet.</p>
                ) : (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Section</TableHead><TableHead>Room</TableHead>
                      <TableHead>Capacity</TableHead><TableHead className="text-right">Actions</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {clsSections.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell className="font-medium">{s.name}</TableCell>
                          <TableCell>{s.room ?? "—"}</TableCell>
                          <TableCell>{s.capacity}</TableCell>
                          <TableCell className="text-right">
                            <Button size="icon" variant="ghost" onClick={() => delSection(s.id)}><Trash2 className="h-4 w-4" /></Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </>
  );
}
