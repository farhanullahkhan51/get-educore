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
import { Plus, Trash2, Pencil, ChevronRight, LayoutGrid } from "lucide-react";
import { SystemBadge } from "./campuses";
import { SeatingChart } from "@/components/classroom/seating-chart";

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
  id: string; tenant_id: string; campus_id: string; class_id: string; name: string;
  capacity: number | null; room: string | null;
  academic_system: "board" | "cambridge" | "both";
  class_teacher_id: string | null;
};
type StudentRow = {
  id: string; student_code: string; first_name: string; last_name: string;
  class_id: string | null; section_id: string | null; status: string; guardian_name: string | null;
};

function ClassesPage() {
  const qc = useQueryClient();
  const [openCls, setOpenCls] = useState(false);
  const [openSec, setOpenSec] = useState<string | null>(null);
  const [editCls, setEditCls] = useState<Klass | null>(null);
  const [editSec, setEditSec] = useState<Section | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [seatSec, setSeatSec] = useState<{ section: Section; className: string } | null>(null);

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
  const { data: teachers } = useQuery({
    queryKey: ["section-teachers"],
    queryFn: async () =>
      (await supabase.from("staff").select("id, first_name, last_name").order("first_name")).data ?? [],
  });

  const { data: students } = useQuery({
    queryKey: ["class-students"],
    queryFn: async () =>
      (
        await supabase
          .from("students")
          .select("id, student_code, first_name, last_name, class_id, section_id, status, guardian_name")
          .order("first_name")
      ).data as StudentRow[] | null,
  });

  const campusMap = new Map(campuses?.map((c) => [c.id, c.name]));

  const { layout } = useModuleLayout("classes");
  const countFor = (classId: string) => {
    const ids = new Set((sections ?? []).filter((s) => s.class_id === classId).map((s) => s.id));
    return (students ?? []).filter((st) => st.class_id === classId || (st.section_id && ids.has(st.section_id))).length;
  };
  const trackLabel = (s: Klass["academic_system"]) =>
    s === "cambridge" ? "Cambridge" : s === "both" ? "Board & Cambridge" : "Board";
  const groups = useArranged<Klass>(classes ?? [], layout, {
    group: {
      track: (c) => trackLabel(c.academic_system),
      campus: (c) => campusMap.get(c.campus_id) ?? "—",
      year: (c) => c.academic_year ?? "No academic year",
    },
    filter: {
      board: (c) => c.academic_system !== "cambridge",
      cambridge: (c) => c.academic_system !== "board",
    },
    sort: {
      name: byText((c) => c.name),
      campus: byText((c) => campusMap.get(c.campus_id)),
      students: byNumberDesc((c) => countFor(c.id)),
    },
  });
  const showCol = (c: string) => !layout.hidden.includes(c);
  const cellCls = densityCell(layout.density);


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

  async function updateClass(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editCls) return;
    const fd = new FormData(e.currentTarget);
    const { error } = await supabase.from("classes").update({
      campus_id: String(fd.get("campus_id")),
      program_id: (fd.get("program_id") as string) || null,
      name: String(fd.get("name")),
      grade_level: String(fd.get("grade_level") || "") || null,
      academic_year: String(fd.get("academic_year") || "") || null,
      academic_system: String(fd.get("academic_system")) as Klass["academic_system"],
    }).eq("id", editCls.id);
    if (error) return toast.error(error.message);
    toast.success("Class updated");
    setEditCls(null);
    qc.invalidateQueries({ queryKey: ["classes"] });
  }

  async function updateSection(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editSec) return;
    const fd = new FormData(e.currentTarget);
    const { error } = await supabase.from("sections").update({
      name: String(fd.get("name")),
      capacity: Number(fd.get("capacity") || 40),
      room: String(fd.get("room") || "") || null,
    }).eq("id", editSec.id);
    if (error) return toast.error(error.message);
    toast.success("Section updated");
    setEditSec(null);
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
        {groups.map((group) => (
        <div key={group.key} className="space-y-4">
        {group.label && (
          <div className="flex items-center gap-3 pt-2">
            <h2 className="font-serif text-sm font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</h2>
            <span className="text-xs text-muted-foreground">{group.rows.length}</span>
            <div className="h-px flex-1 bg-border" />
          </div>
        )}
        {group.rows.map((cls) => {
          const clsSections = sections?.filter((s) => s.class_id === cls.id) ?? [];
          const sectionNames = new Map(clsSections.map((s) => [s.id, s.name]));
          const clsStudents =
            students?.filter(
              (st) => st.class_id === cls.id || (st.section_id && sectionNames.has(st.section_id)),
            ) ?? [];
          const isOpen = expanded === cls.id;
          return (
            <Card key={cls.id} className="shadow-none">

              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : cls.id)}
                  className="flex items-start gap-2 text-left"
                  aria-expanded={isOpen}
                >
                  <ChevronRight className={`mt-1 h-4 w-4 shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                  <div>
                    <CardTitle className="font-serif text-lg">{cls.name}</CardTitle>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{campusMap.get(cls.campus_id)}</span>
                      <span>·</span>
                      <span>{cls.academic_year ?? "—"}</span>
                      <span>·</span>
                      <span>{clsStudents.length} student{clsStudents.length === 1 ? "" : "s"}</span>
                      <SystemBadge system={cls.academic_system} />
                    </div>
                  </div>
                </button>
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
                  <Button size="icon" variant="ghost" onClick={() => setEditCls(cls)}><Pencil className="h-4 w-4" /></Button>
                  <Button size="icon" variant="ghost" onClick={() => delClass(cls.id)}><Trash2 className="h-4 w-4" /></Button>
                </div>
              </CardHeader>
              <CardContent>
                {clsSections.length === 0 ? (
                  <p className="text-xs text-muted-foreground">No sections yet.</p>
                ) : (
                  <Table>
                    <TableHeader><TableRow>
                      <TableHead>Section</TableHead><TableHead>Class teacher</TableHead><TableHead>Room</TableHead>
                      <TableHead>Capacity</TableHead><TableHead className="text-right">Actions</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {clsSections.map((s) => {
                        const t = teachers?.find((x) => x.id === s.class_teacher_id);
                        return (
                        <TableRow key={s.id}>
                          <TableCell className="font-medium">{s.name}</TableCell>
                          <TableCell className={t ? "" : "text-muted-foreground"}>
                            {t ? `${t.first_name} ${t.last_name}` : "Unassigned"}
                          </TableCell>
                          <TableCell>{s.room ?? "—"}</TableCell>
                          <TableCell>{s.capacity}</TableCell>

                          <TableCell className="text-right">
                            <Button size="sm" variant="outline" className="mr-1" onClick={() => setSeatSec({ section: s, className: `${cls.name} · ${s.name}` })}>
                              <LayoutGrid className="mr-1 h-3 w-3" /> Seating
                            </Button>
                            <Button size="icon" variant="ghost" onClick={() => setEditSec(s)}><Pencil className="h-4 w-4" /></Button>
                            <Button size="icon" variant="ghost" onClick={() => delSection(s.id)}><Trash2 className="h-4 w-4" /></Button>
                          </TableCell>
                        </TableRow>
                        );
                      })}

                    </TableBody>
                  </Table>
                )}

                {isOpen && (
                  <div className="mt-6 border-t pt-4">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Students in {cls.name}
                    </p>
                    {clsStudents.length === 0 ? (
                      <p className="text-xs text-muted-foreground">No students enrolled in this class yet.</p>
                    ) : (
                      <Table>
                        <TableHeader><TableRow>
                          <TableHead>Student ID</TableHead><TableHead>Name</TableHead>
                          <TableHead>Section</TableHead><TableHead>Guardian</TableHead><TableHead>Status</TableHead>
                        </TableRow></TableHeader>
                        <TableBody>
                          {clsStudents.map((st) => (
                            <TableRow key={st.id}>
                              <TableCell className="font-mono text-xs">{st.student_code}</TableCell>
                              <TableCell className="font-medium">{st.first_name} {st.last_name}</TableCell>
                              <TableCell>{st.section_id ? (sectionNames.get(st.section_id) ?? "—") : "—"}</TableCell>
                              <TableCell>{st.guardian_name ?? "—"}</TableCell>
                              <TableCell className="capitalize">{st.status}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
        </div>
        ))}
      </div>


      <Dialog open={!!editCls} onOpenChange={(o) => !o && setEditCls(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-serif">Edit class</DialogTitle></DialogHeader>
          {editCls && (
            <form onSubmit={updateClass} className="space-y-4" key={editCls.id}>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Campus</Label>
                  <Select name="campus_id" defaultValue={editCls.campus_id} required>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{campuses?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Program (optional)</Label>
                  <Select name="program_id" defaultValue={editCls.program_id ?? undefined}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>{programs?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Name</Label><Input name="name" defaultValue={editCls.name} required /></div>
                <div className="space-y-2"><Label>Grade level</Label><Input name="grade_level" defaultValue={editCls.grade_level ?? ""} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Academic year</Label><Input name="academic_year" defaultValue={editCls.academic_year ?? ""} /></div>
                <div className="space-y-2">
                  <Label>System</Label>
                  <Select name="academic_system" defaultValue={editCls.academic_system}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="board">Board</SelectItem>
                      <SelectItem value="cambridge">Cambridge</SelectItem>
                      <SelectItem value="both">Both</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter><Button type="submit">Save changes</Button></DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!editSec} onOpenChange={(o) => !o && setEditSec(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-serif">Edit section</DialogTitle></DialogHeader>
          {editSec && (
            <form onSubmit={updateSection} className="space-y-4" key={editSec.id}>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2"><Label>Name</Label><Input name="name" defaultValue={editSec.name} required /></div>
                <div className="space-y-2"><Label>Capacity</Label><Input name="capacity" type="number" defaultValue={editSec.capacity ?? 40} /></div>
                <div className="space-y-2"><Label>Room</Label><Input name="room" defaultValue={editSec.room ?? ""} /></div>
              </div>
              <DialogFooter><Button type="submit">Save changes</Button></DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!seatSec} onOpenChange={(o) => !o && setSeatSec(null)}>
        <DialogContent className="max-w-5xl">
          <DialogHeader>
            <DialogTitle className="font-serif">Classroom — {seatSec?.className}</DialogTitle>
          </DialogHeader>
          {seatSec && (
            <div className="max-h-[70vh] overflow-y-auto pr-1">
              <SeatingChart
                section={sections?.find((s) => s.id === seatSec.section.id) ?? seatSec.section}
                className={seatSec.className}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>

  );
}
