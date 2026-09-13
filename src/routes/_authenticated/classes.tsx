import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetch-all";
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
import { LayoutMenu } from "@/components/layout/layout-menu";
import { useModuleLayout } from "@/lib/ui-prefs";
import { useArranged, byText, byNumberDesc, densityCell } from "@/lib/ui-arrange";
import { ActiveFilterChip, FilteredEmptyState } from "@/components/layout/filter-chip";
import { trackChipCls, trackTextCls } from "@/components/layout/track-heading";
import { useTrackLayout } from "@/lib/track-layout";


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
  const [collapsedGroups, setCollapsedGroups] = useState<string[]>([]);

  const [seatSec, setSeatSec] = useState<{ section: Section; className: string } | null>(null);

  /** New-class form: campus / program drive which examination system the class belongs to. */
  const [newCampus, setNewCampus] = useState<string>("");
  const [newProgram, setNewProgram] = useState<string>("");
  const [systemOverride, setSystemOverride] = useState<Klass["academic_system"] | null>(null);

  const { data: campuses } = useQuery({
    queryKey: ["campuses"],
    queryFn: async () =>
      (await supabase.from("campuses").select("id, name, academic_system").order("name")).data ?? [],
  });
  const { data: programs } = useQuery({
    queryKey: ["programs"],
    queryFn: async () =>
      (await supabase.from("programs").select("id, name, campus_id, academic_system").order("name")).data ?? [],
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
      (await fetchAllRows<StudentRow>((from, to) =>
        supabase
          .from("students")
          .select("id, student_code, first_name, last_name, class_id, section_id, status, guardian_name")
          .order("first_name")
          .range(from, to) as any,
      )) as StudentRow[],
  });

  const campusMap = new Map(campuses?.map((c) => [c.id, c.name]));

  /** Chairs currently occupied, per section — so the list shows seating without opening each class. */
  const { data: seats } = useQuery({
    queryKey: ["section-seat-counts"],
    queryFn: async () =>
      (await supabase.from("section_seats").select("section_id, student_id")).data ?? [],
  });
  const seatedBySection = new Map<string, number>();
  for (const s of seats ?? []) {
    if (!s.student_id) continue;
    seatedBySection.set(s.section_id, (seatedBySection.get(s.section_id) ?? 0) + 1);
  }

  const { layout: savedLayout } = useModuleLayout("classes");
  // Class records are authoritative here. Tenant branding can resolve later or
  // contain an outdated system value, which must never collapse mixed records.
  const layout = useTrackLayout(savedLayout, (classes ?? []).map((c) => c.academic_system));
  const countFor = (classId: string) => {
    const ids = new Set((sections ?? []).filter((s) => s.class_id === classId).map((s) => s.id));
    return (students ?? []).filter((st) => st.class_id === classId || (st.section_id && ids.has(st.section_id))).length;
  };
  const trackLabel = (s: Klass["academic_system"]) =>
    s === "cambridge" ? "Cambridge" : s === "both" ? "Board & Cambridge" : "Board";
  // Board and Cambridge stay apart under every grouping, not only the Board / Cambridge one.
  const withTrack = (label: string, c: Klass) =>
    layout.groupBy === "track" ? label : `${trackLabel(c.academic_system)} — ${label}`;
  const groups = useArranged<Klass>(classes ?? [], layout, {
    group: {
      track: (c) => trackLabel(c.academic_system),
      campus: (c) => withTrack(campusMap.get(c.campus_id) ?? "—", c),
      year: (c) => withTrack(c.academic_year ?? "No academic year", c),
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

  /** A new class belongs to the programme's system, or the campus's when no programme is chosen. */
  const inheritedSystem: Klass["academic_system"] =
    ((newProgram ? programs?.find((p) => p.id === newProgram)?.academic_system : null) ??
      (newCampus ? campuses?.find((c) => c.id === newCampus)?.academic_system : null) ??
      "both") as Klass["academic_system"];
  const systemLocked = inheritedSystem !== "both";
  const newSystem: Klass["academic_system"] = systemLocked ? inheritedSystem : systemOverride ?? "board";



  async function createClass(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (!newCampus) return toast.error("Choose a campus first");
    const payload = {
      campus_id: newCampus,
      program_id: newProgram || null,
      name: String(fd.get("name")),
      grade_level: String(fd.get("grade_level") || "") || null,
      academic_year: String(fd.get("academic_year") || "") || null,
      academic_system: newSystem,
    };
    const { error } = await supabase.from("classes").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Class created");
    setOpenCls(false);
    setNewCampus(""); setNewProgram(""); setSystemOverride(null);
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
    const campus_id = String(fd.get("campus_id"));
    const academic_system = String(fd.get("academic_system")) as Klass["academic_system"];
    const { error } = await supabase.from("classes").update({
      campus_id,
      program_id: (fd.get("program_id") as string) || null,
      name: String(fd.get("name")),
      grade_level: String(fd.get("grade_level") || "") || null,
      academic_year: String(fd.get("academic_year") || "") || null,
      academic_system,
    }).eq("id", editCls.id);
    if (error) return toast.error(error.message);
    // Sections always follow their parent class's campus and examination system.
    const { error: secErr } = await supabase
      .from("sections")
      .update({ campus_id, academic_system })
      .eq("class_id", editCls.id);
    if (secErr) return toast.error(secErr.message);
    toast.success("Class updated");
    setEditCls(null);
    qc.invalidateQueries({ queryKey: ["classes"] });
    qc.invalidateQueries({ queryKey: ["sections"] });
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
          <div className="flex items-center gap-2">
          <LayoutMenu module="classes" />
          <Dialog open={openCls} onOpenChange={setOpenCls}>
            <DialogTrigger asChild><Button><Plus className="mr-1 h-4 w-4" /> New class</Button></DialogTrigger>

            <DialogContent>
              <DialogHeader><DialogTitle className="font-serif">New class</DialogTitle></DialogHeader>
              <form onSubmit={createClass} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Campus</Label>
                    <Select value={newCampus} onValueChange={(v) => { setNewCampus(v); setNewProgram(""); setSystemOverride(null); }}>
                      <SelectTrigger><SelectValue placeholder="Campus" /></SelectTrigger>
                      <SelectContent>{campuses?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Program (optional)</Label>
                    <Select value={newProgram} onValueChange={(v) => { setNewProgram(v); setSystemOverride(null); }}>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        {(programs ?? [])
                          .filter((p) => !newCampus || p.campus_id === newCampus)
                          .map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                      </SelectContent>
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
                    <Select
                      value={newSystem}
                      disabled={systemLocked}
                      onValueChange={(v) => setSystemOverride(v as Klass["academic_system"])}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="board">Board</SelectItem>
                        <SelectItem value="cambridge">Cambridge</SelectItem>
                        <SelectItem value="both">Both</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground">
                      {systemLocked
                        ? `Set by the ${newProgram ? "programme" : "campus"} you chose.`
                        : "Choose which examination system this class follows."}
                    </p>
                  </div>
                </div>
                <DialogFooter><Button type="submit">Create class</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
          </div>
        }

      />

      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2"><ActiveFilterChip module="classes" /></div>
        {(classes?.length ?? 0) === 0 && (
          <Card className="shadow-none"><CardContent className="py-8 text-center text-sm text-muted-foreground">No classes yet.</CardContent></Card>
        )}
        {(classes?.length ?? 0) > 0 && groups.reduce((n, g) => n + g.rows.length, 0) === 0 && (
          <Card className="shadow-none">
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              <FilteredEmptyState module="classes" noun="classes" />
            </CardContent>
          </Card>
        )}
        {groups.map((group) => {
        const collapsed = collapsedGroups.includes(group.key);
        return (
        <div key={group.key} className="space-y-4">
        {group.label && (
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() =>
                setCollapsedGroups((prev) =>
                  prev.includes(group.key) ? prev.filter((k) => k !== group.key) : [...prev, group.key],
                )
              }
              className="flex items-center gap-2 text-left"
              aria-expanded={!collapsed}
              title={collapsed ? `Expand ${group.label}` : `Collapse ${group.label}`}
            >
              <ChevronRight className={`h-4 w-4 transition-transform ${collapsed ? "" : "rotate-90"}`} />
              <h2 className={`rounded px-2 py-0.5 font-serif text-sm font-semibold uppercase tracking-wide ${trackChipCls(group.label)} ${trackTextCls(group.label)}`}>
                {group.label}
              </h2>
              <span className="text-xs text-muted-foreground">{group.rows.length}</span>
            </button>
            <div className="h-px flex-1 bg-border" />
          </div>
        )}
        {!collapsed && group.rows.map((cls) => {

          const clsSections = sections?.filter((s) => s.class_id === cls.id) ?? [];
          const sectionNames = new Map(clsSections.map((s) => [s.id, s.name]));
          const clsStudents =
            students?.filter(
              (st) => st.class_id === cls.id || (st.section_id && sectionNames.has(st.section_id)),
            ) ?? [];
          const clsSeated = clsSections.reduce((n, s) => n + (seatedBySection.get(s.id) ?? 0), 0);
          const clsSeats = clsSections.reduce((n, s) => n + (s.capacity ?? 0), 0);
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
                      <span>·</span>
                      <span className={clsStudents.length > clsSeated ? "font-medium text-amber-700 dark:text-amber-400" : ""}>
                        {clsSeated} seated{clsSeats > 0 ? ` of ${clsSeats} chairs` : ""}
                        {clsStudents.length > clsSeated ? ` · ${clsStudents.length - clsSeated} unseated` : ""}
                      </span>
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
                      <TableHead>Section</TableHead>
                      {showCol("teacher") && <TableHead>Class teacher</TableHead>}
                      {showCol("room") && <TableHead>Room</TableHead>}
                      {showCol("capacity") && <TableHead>Enrolled / Capacity</TableHead>}
                      {showCol("capacity") && <TableHead>Seated</TableHead>}
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow></TableHeader>
                    <TableBody>
                      {clsSections.map((s) => {
                        const t = teachers?.find((x) => x.id === s.class_teacher_id);
                        return (
                        <TableRow key={s.id}>
                          <TableCell className={`font-medium ${cellCls}`}>{s.name}</TableCell>
                          {showCol("teacher") && (
                            <TableCell className={`${t ? "" : "text-muted-foreground"} ${cellCls}`}>
                              {t ? `${t.first_name} ${t.last_name}` : "Unassigned"}
                            </TableCell>
                          )}
                          {showCol("room") && <TableCell className={cellCls}>{s.room ?? "—"}</TableCell>}
                          {showCol("capacity") && (() => {
                            const enrolled = (students ?? []).filter(
                              (st) => st.section_id === s.id && (st.status ?? "active") === "active",
                            ).length;
                            const seated = seatedBySection.get(s.id) ?? 0;
                            const over = s.capacity != null && enrolled > s.capacity;
                            return (
                              <>
                                <TableCell className={cellCls}>
                                  <span className={over ? "font-semibold text-destructive" : ""}>
                                    {enrolled}/{s.capacity ?? "—"}
                                  </span>
                                  {over && (
                                    <span className="ml-2 rounded bg-destructive/10 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
                                      Over capacity
                                    </span>
                                  )}
                                </TableCell>
                                <TableCell className={cellCls}>
                                  <span className={enrolled > seated ? "text-amber-700 dark:text-amber-400" : ""}>
                                    {seated} seated
                                  </span>
                                  {enrolled > seated && (
                                    <span className="ml-1 text-[11px] text-muted-foreground">
                                      · {enrolled - seated} unseated
                                    </span>
                                  )}
                                </TableCell>
                              </>
                            );
                          })()}


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
        );
        })}

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
