import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EditableTabs } from "@/components/layout/editable";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { LayoutMenu } from "@/components/layout/layout-menu";
import { useModuleLayout } from "@/lib/ui-prefs";
import { useArranged, byText, densityCell } from "@/lib/ui-arrange";
import { Fragment } from "react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { generateCode } from "@/lib/generate-code";
import { useCurrentUser } from "@/hooks/use-current-user";

export const Route = createFileRoute("/_authenticated/courses")({
  component: CoursesPage,
});

type Course = {
  id: string;
  campus_id: string;
  program_id: string | null;
  class_id: string | null;
  code: string;
  title: string;
  credit_hours: number | null;
  academic_system: "board" | "cambridge" | "both";
  stream: string | null;
  description: string | null;
  is_active: boolean;
};

const STREAMS = [
  { value: "science", label: "Science Group", system: "board" as const },
  { value: "arts", label: "Arts / Humanities", system: "board" as const },
  { value: "o_level", label: "O-Levels", system: "cambridge" as const },
  { value: "a_level", label: "A-Levels", system: "cambridge" as const },
];

const streamLabel = (v?: string | null) => STREAMS.find((s) => s.value === v)?.label ?? null;

type Assignment = {
  id: string;
  campus_id: string;
  course_id: string;
  section_id: string;
  teacher_id: string;
  academic_year: string | null;
};

function CoursesPage() {
  return (
    <>
      <PageHeader
        eyebrow="Academics"
        title="Courses & Teaching Assignments"
        description="Define subjects/courses and assign teachers to sections."
      />
      <EditableTabs scope="module:courses" fallback="courses">
        <TabsContent value="courses"><CoursesTab /></TabsContent>
        <TabsContent value="assignments"><AssignmentsTab /></TabsContent>
      </EditableTabs>
    </>
  );
}

function CoursesTab() {
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const [editing, setEditing] = useState<Course | null>(null);
  const [open, setOpen] = useState(false);
  const [streamFilter, setStreamFilter] = useState<string>("all");
  const [formSystem, setFormSystem] = useState<Course["academic_system"]>("both");

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
    queryFn: async () => (await supabase.from("classes").select("id, name, campus_id").order("name")).data ?? [],
  });
  const { data: courses, isLoading } = useQuery({
    queryKey: ["courses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("courses").select("*").order("code");
      if (error) throw error;
      return data as Course[];
    },
  });

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const title = String(fd.get("title"));
    let code = String(fd.get("code") || "").trim().toUpperCase();
    if (!code) code = generateCode(title, (courses ?? []).map((c) => c.code));
    const campusId = String(fd.get("campus_id") || me?.campusId || "");
    if (!campusId) return toast.error("Select a campus");
    const programId = (fd.get("program_id") as string) || null;
    if (!programId) return toast.error("Select a program for this course");
    const payload = {
      campus_id: campusId,
      program_id: programId,
      class_id: (fd.get("class_id") as string) || null,
      code,
      title,
      credit_hours: Number(fd.get("credit_hours") || 1),
      academic_system: String(fd.get("academic_system") || "both") as Course["academic_system"],
      stream: (fd.get("stream") as string) || null,
      description: String(fd.get("description") || "") || null,
      is_active: true,
    };
    const res = editing
      ? await supabase.from("courses").update(payload).eq("id", editing.id)
      : await supabase.from("courses").insert(payload);
    if (res.error) return toast.error(res.error.message);
    toast.success(editing ? "Course updated" : "Course created");
    setOpen(false); setEditing(null);
    qc.invalidateQueries({ queryKey: ["courses"] });
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this course?")) return;
    const { error } = await supabase.from("courses").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["courses"] });
  }

  const campusMap = new Map(campuses?.map((c) => [c.id, c.name]));
  const programMap = new Map(programs?.map((p) => [p.id, p.name]));
  const classMap = new Map(classes?.map((c) => [c.id, c.name]));

  const visibleCourses = (courses ?? []).filter((c) => {
    if (streamFilter === "all") return true;
    if (streamFilter === "board") return c.academic_system !== "cambridge";
    if (streamFilter === "cambridge") return c.academic_system !== "board";
    return c.stream === streamFilter;
  });

  const { layout } = useModuleLayout("courses");
  const groups = useArranged<Course>(visibleCourses, layout, {
    group: {
      track: (c) => (c.academic_system === "cambridge" ? "Cambridge" : c.academic_system === "board" ? "Board" : "Board & Cambridge"),
      stream: (c) =>
        streamLabel(c.stream)
          ? `${c.academic_system === "cambridge" ? "Cambridge" : "Board"} · ${streamLabel(c.stream)}`
          : "Ungrouped",
      campus: (c) => campusMap.get(c.campus_id) ?? "—",
      class: (c) => (c.class_id && classMap.get(c.class_id)) || "No class",
    },
    filter: {
      board: (c) => c.academic_system !== "cambridge",
      cambridge: (c) => c.academic_system !== "board",
      active: (c) => (c as { is_active?: boolean }).is_active !== false,
    },
    sort: {
      title: byText((c) => c.title),
      code: byText((c) => c.code),
    },
  });
  const showCol = (k: string) => !layout.hidden.includes(k);
  const cellCls = densityCell(layout.density);
  const colSpan = 4 + ["campus", "class", "credits"].filter(showCol).length;

  const filterChips = [
    { value: "all", label: "All courses" },
    { value: "board", label: "Board" },
    { value: "science", label: "Board · Science" },
    { value: "arts", label: "Board · Arts / Humanities" },
    { value: "cambridge", label: "Cambridge" },
    { value: "o_level", label: "Cambridge · O-Levels" },
    { value: "a_level", label: "Cambridge · A-Levels" },
  ];

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center gap-2 overflow-x-auto">
        {filterChips.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setStreamFilter(f.value)}
            className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
              streamFilter === f.value
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-muted/40 text-muted-foreground hover:bg-muted"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="mb-4 flex justify-end gap-2">
        <LayoutMenu module="courses" />


        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-1 h-4 w-4" /> New course</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-serif">{editing ? "Edit course" : "New course"}</DialogTitle>
              <DialogDescription>Define a subject or course offered at a campus.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Campus</Label>
                <Select name="campus_id" defaultValue={editing?.campus_id ?? me?.campusId ?? undefined} required>
                  <SelectTrigger><SelectValue placeholder="Select campus" /></SelectTrigger>
                  <SelectContent>
                    {campuses?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Title</Label>
                  <Input name="title" defaultValue={editing?.title} required />
                </div>
                <div className="space-y-2">
                  <Label>Code</Label>
                  <Input name="code" defaultValue={editing?.code} placeholder="Auto from title" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Program</Label>
                  <Select name="program_id" defaultValue={editing?.program_id ?? undefined} required>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      {programs?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Class (optional)</Label>
                  <Select name="class_id" defaultValue={editing?.class_id ?? undefined}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      {classes?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Credit hours</Label>
                  <Input name="credit_hours" type="number" step="0.5" min={0.5} defaultValue={editing?.credit_hours ?? 1} />
                </div>
                <div className="space-y-2">
                  <Label>Academic system</Label>
                  <Select
                    name="academic_system"
                    value={formSystem}
                    onValueChange={(v) => setFormSystem(v as Course["academic_system"])}
                  >
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
                <Label>Group / Level</Label>
                <Select name="stream" defaultValue={editing?.stream ?? undefined} key={`${editing?.id ?? "new"}-${formSystem}`}>
                  <SelectTrigger><SelectValue placeholder="Not grouped" /></SelectTrigger>
                  <SelectContent>
                    {STREAMS.filter((s) => formSystem === "both" || s.system === formSystem).map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.system === "board" ? "Board" : "Cambridge"} · {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Description</Label>
                <Input name="description" defaultValue={editing?.description ?? ""} />
              </div>
              <DialogFooter><Button type="submit">{editing ? "Save" : "Create"}</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="shadow-none">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Title</TableHead>
                {showCol("campus") && <TableHead>Campus</TableHead>}
                {showCol("class") && <TableHead>Program / Class</TableHead>}
                {showCol("credits") && <TableHead>Credits</TableHead>}
                <TableHead>System</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={colSpan} className="py-8 text-center text-sm text-muted-foreground">Loading…</TableCell></TableRow>}
              {courses?.length === 0 && <TableRow><TableCell colSpan={colSpan} className="py-8 text-center text-sm text-muted-foreground">No courses yet.</TableCell></TableRow>}
              {groups.map((group) => (
                <Fragment key={group.key}>
                  {group.label && (
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableCell colSpan={colSpan} className="py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {group.label} · {group.rows.length}
                      </TableCell>
                    </TableRow>
                  )}
                  {group.rows.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className={cellCls}><code className="rounded bg-muted px-1.5 py-0.5 text-xs">{c.code}</code></TableCell>
                  <TableCell className={`font-medium ${cellCls}`}>{c.title}</TableCell>
                  {showCol("campus") && <TableCell className={`text-sm ${cellCls}`}>{campusMap.get(c.campus_id) ?? "—"}</TableCell>}
                  {showCol("class") && (
                    <TableCell className={`text-sm text-muted-foreground ${cellCls}`}>
                      {[c.program_id && programMap.get(c.program_id), c.class_id && classMap.get(c.class_id)].filter(Boolean).join(" · ") || "—"}
                    </TableCell>
                  )}
                  {showCol("credits") && <TableCell className={`text-sm ${cellCls}`}>{c.credit_hours}</TableCell>}
                  <TableCell className={`text-sm capitalize ${cellCls}`}>{c.academic_system}</TableCell>
                  <TableCell className={`text-right ${cellCls}`}>
                    <Button size="icon" variant="ghost" onClick={() => { setEditing(c); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
                    <Button size="icon" variant="ghost" onClick={() => handleDelete(c.id)}><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
                  ))}
                </Fragment>
              ))}

            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}

function AssignmentsTab() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: courses } = useQuery({
    queryKey: ["courses"],
    queryFn: async () => (await supabase.from("courses").select("id, code, title, campus_id").order("code")).data ?? [],
  });
  const { data: sections } = useQuery({
    queryKey: ["sections"],
    queryFn: async () => (await supabase.from("sections").select("id, name, class_id").order("name")).data ?? [],
  });
  const { data: classes } = useQuery({
    queryKey: ["classes"],
    queryFn: async () => (await supabase.from("classes").select("id, name, campus_id").order("name")).data ?? [],
  });
  const { data: staff } = useQuery({
    queryKey: ["staff"],
    queryFn: async () => (await supabase.from("staff").select("id, first_name, last_name, staff_code, campus_id, designation").order("first_name")).data ?? [],
  });
  const { data: assignments, isLoading } = useQuery({
    queryKey: ["course_assignments"],
    queryFn: async () => {
      const { data, error } = await supabase.from("course_assignments").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Assignment[];
    },
  });

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const courseId = String(fd.get("course_id"));
    const course = courses?.find((c) => c.id === courseId);
    if (!course) return toast.error("Select a course");
    const payload = {
      campus_id: course.campus_id,
      course_id: courseId,
      section_id: String(fd.get("section_id")),
      teacher_id: String(fd.get("teacher_id")),
      academic_year: String(fd.get("academic_year") || new Date().getFullYear()),
    };
    const { error } = await supabase.from("course_assignments").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Assignment created");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["course_assignments"] });
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this teaching assignment?")) return;
    const { error } = await supabase.from("course_assignments").delete().eq("id", id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["course_assignments"] });
  }

  const courseMap = new Map(courses?.map((c) => [c.id, `${c.code} · ${c.title}`]));
  const sectionMap = new Map(sections?.map((s) => {
    const cls = classes?.find((c) => c.id === s.class_id);
    return [s.id, cls ? `${cls.name} — ${s.name}` : s.name];
  }));
  const staffMap = new Map(staff?.map((s) => [s.id, `${s.first_name} ${s.last_name}`]));

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="mr-1 h-4 w-4" /> New assignment</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-serif">Assign teacher to section</DialogTitle>
              <DialogDescription>Link a teacher to a specific course + section for the academic year.</DialogDescription>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label>Course</Label>
                <Select name="course_id" required>
                  <SelectTrigger><SelectValue placeholder="Select course" /></SelectTrigger>
                  <SelectContent>
                    {courses?.map((c) => <SelectItem key={c.id} value={c.id}>{c.code} · {c.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Section</Label>
                <Select name="section_id" required>
                  <SelectTrigger><SelectValue placeholder="Select section" /></SelectTrigger>
                  <SelectContent>
                    {sections?.map((s) => <SelectItem key={s.id} value={s.id}>{sectionMap.get(s.id)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Teacher</Label>
                <Select name="teacher_id" required>
                  <SelectTrigger><SelectValue placeholder="Select teacher" /></SelectTrigger>
                  <SelectContent>
                    {staff?.map((s) => <SelectItem key={s.id} value={s.id}>{`${s.first_name} ${s.last_name}`} {s.designation ? `· ${s.designation}` : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Academic year</Label>
                <Input name="academic_year" placeholder={String(new Date().getFullYear())} />
              </div>
              <DialogFooter><Button type="submit">Assign</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="shadow-none">
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Course</TableHead>
                <TableHead>Section</TableHead>
                <TableHead>Teacher</TableHead>
                <TableHead>Year</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">Loading…</TableCell></TableRow>}
              {assignments?.length === 0 && <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">No teaching assignments yet.</TableCell></TableRow>}
              {assignments?.map((a) => (
                <TableRow key={a.id}>
                  <TableCell>{courseMap.get(a.course_id) ?? "—"}</TableCell>
                  <TableCell>{sectionMap.get(a.section_id) ?? "—"}</TableCell>
                  <TableCell>{staffMap.get(a.teacher_id) ?? "—"}</TableCell>
                  <TableCell className="text-sm">{a.academic_year ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" onClick={() => handleDelete(a.id)}><Trash2 className="h-4 w-4" /></Button>
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
