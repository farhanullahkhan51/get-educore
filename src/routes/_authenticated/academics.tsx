import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Save, Users } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";

export const Route = createFileRoute("/_authenticated/academics")({
  component: AcademicsPage,
});

type Student = { id: string; first_name: string; last_name: string; student_code: string; section_id: string | null };
type AttStatus = "present" | "absent" | "late" | "leave";

function AcademicsPage() {
  return (
    <>
      <PageHeader
        eyebrow="Teaching"
        title="Academics"
        description="Attendance and gradebook for your assigned sections."
      />
      <Tabs defaultValue="attendance">
        <TabsList>
          <TabsTrigger value="attendance">Attendance</TabsTrigger>
          <TabsTrigger value="gradebook">Gradebook</TabsTrigger>
        </TabsList>
        <TabsContent value="attendance"><AttendanceTab /></TabsContent>
        <TabsContent value="gradebook"><GradebookTab /></TabsContent>
      </Tabs>
    </>
  );
}

// ---- Shared selectors (section + course) ----
function useSectionCoursePicker() {
  const [sectionId, setSectionId] = useState<string>("");
  const [courseId, setCourseId] = useState<string>("");

  const { data: sections } = useQuery({
    queryKey: ["sections-with-class"],
    queryFn: async () => {
      const { data } = await supabase.from("sections").select("id, name, class_id, campus_id, classes(name)");
      return data ?? [];
    },
  });
  const { data: courses } = useQuery({
    queryKey: ["courses-simple"],
    queryFn: async () => (await supabase.from("courses").select("id, code, title, campus_id").order("code")).data ?? [],
  });

  return { sectionId, setSectionId, courseId, setCourseId, sections, courses };
}

// ---- Attendance ----
function AttendanceTab() {
  const qc = useQueryClient();
  const { sectionId, setSectionId, courseId, setCourseId, sections, courses } = useSectionCoursePicker();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [marks, setMarks] = useState<Record<string, AttStatus>>({});

  const { data: students } = useQuery({
    queryKey: ["students-in-section", sectionId],
    enabled: !!sectionId,
    queryFn: async () => {
      const { data, error } = await supabase.from("students")
        .select("id, first_name, last_name, student_code, section_id")
        .eq("section_id", sectionId).order("first_name");
      if (error) throw error;
      return data as Student[];
    },
  });

  const { data: existing } = useQuery({
    queryKey: ["attendance", sectionId, courseId, date],
    enabled: !!sectionId && !!date,
    queryFn: async () => {
      let q = supabase.from("attendance_records").select("*").eq("section_id", sectionId).eq("date", date);
      if (courseId) q = q.eq("course_id", courseId); else q = q.is("course_id", null);
      const { data } = await q;
      return data ?? [];
    },
  });

  // Seed marks from existing rows
  useMemo(() => {
    if (existing && students) {
      const map: Record<string, AttStatus> = {};
      for (const s of students) map[s.id] = "present";
      for (const r of existing) map[r.student_id] = r.status as AttStatus;
      setMarks(map);
    }
  }, [existing, students]);

  const section = sections?.find((s) => s.id === sectionId);

  async function bulkMark(status: AttStatus) {
    if (!students) return;
    const m: Record<string, AttStatus> = {};
    for (const s of students) m[s.id] = status;
    setMarks(m);
  }

  async function save() {
    if (!students || !section) return toast.error("Select a section");
    const rows = students.map((s) => ({
      campus_id: section.campus_id,
      section_id: sectionId,
      student_id: s.id,
      course_id: courseId || null,
      date,
      status: (marks[s.id] ?? "present") as AttStatus,
    }));
    const { error } = await supabase.from("attendance_records").upsert(rows, {
      onConflict: "student_id,date,course_id",
    });
    if (error) return toast.error(error.message);
    toast.success(`Saved attendance for ${rows.length} students`);
    qc.invalidateQueries({ queryKey: ["attendance", sectionId, courseId, date] });
  }

  const counts = useMemo(() => {
    const c = { present: 0, absent: 0, late: 0, leave: 0 };
    for (const v of Object.values(marks)) c[v as AttStatus]++;
    return c;
  }, [marks]);

  return (
    <div className="space-y-4">
      <Card className="shadow-none">
        <CardContent className="grid gap-4 p-4 md:grid-cols-4">
          <div className="space-y-2">
            <Label>Section</Label>
            <Select value={sectionId} onValueChange={setSectionId}>
              <SelectTrigger><SelectValue placeholder="Select section" /></SelectTrigger>
              <SelectContent>
                {sections?.map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.classes?.name ? `${s.classes.name} — ${s.name}` : s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Course (optional)</Label>
            <Select value={courseId} onValueChange={(v) => setCourseId(v === "__none__" ? "" : v)}>
              <SelectTrigger><SelectValue placeholder="Whole-day attendance" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Whole-day attendance</SelectItem>
                {courses?.map((c) => <SelectItem key={c.id} value={c.id}>{c.code} · {c.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Date</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="flex items-end gap-2">
            <Button variant="outline" size="sm" onClick={() => bulkMark("present")}>All Present</Button>
            <Button variant="outline" size="sm" onClick={() => bulkMark("absent")}>All Absent</Button>
          </div>
        </CardContent>
      </Card>

      {sectionId && (
        <>
          <div className="grid grid-cols-4 gap-3">
            <StatCard label="Present" value={counts.present} tone="ok" />
            <StatCard label="Absent" value={counts.absent} tone="bad" />
            <StatCard label="Late" value={counts.late} tone="warn" />
            <StatCard label="Leave" value={counts.leave} tone="muted" />
          </div>

          <Card className="shadow-none">
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Student ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(!students || students.length === 0) && (
                    <TableRow><TableCell colSpan={3} className="py-8 text-center text-sm text-muted-foreground">
                      No students enrolled in this section.
                    </TableCell></TableRow>
                  )}
                  {students?.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell><code className="text-xs">{s.student_code}</code></TableCell>
                      <TableCell className="font-medium">{s.first_name} {s.last_name}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {(["present","absent","late","leave"] as AttStatus[]).map((st) => (
                            <button
                              key={st}
                              type="button"
                              onClick={() => setMarks((m) => ({ ...m, [s.id]: st }))}
                              className={`rounded px-2 py-1 text-xs uppercase tracking-wide ${
                                marks[s.id] === st
                                  ? st === "present" ? "bg-emerald-600 text-white" :
                                    st === "absent" ? "bg-red-600 text-white" :
                                    st === "late" ? "bg-amber-500 text-white" :
                                    "bg-slate-500 text-white"
                                  : "bg-muted text-muted-foreground hover:bg-muted-foreground/10"
                              }`}
                            >
                              {st[0].toUpperCase()}
                            </button>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={save}><Save className="mr-1 h-4 w-4" /> Save attendance</Button>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: "ok"|"bad"|"warn"|"muted" }) {
  const bg = { ok: "bg-emerald-50 text-emerald-900 border-emerald-200",
    bad: "bg-red-50 text-red-900 border-red-200",
    warn: "bg-amber-50 text-amber-900 border-amber-200",
    muted: "bg-slate-50 text-slate-900 border-slate-200" }[tone];
  return (
    <div className={`rounded-md border p-3 ${bg}`}>
      <div className="text-xs uppercase tracking-widest opacity-70">{label}</div>
      <div className="mt-1 font-serif text-2xl font-semibold">{value}</div>
    </div>
  );
}

// ---- Gradebook ----
type Assessment = {
  id: string; campus_id: string; course_id: string; section_id: string;
  title: string; type: string; max_marks: number; weight_percent: number;
  due_date: string | null; term: string | null; academic_year: string | null;
};

function GradebookTab() {
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const { sectionId, setSectionId, courseId, setCourseId, sections, courses } = useSectionCoursePicker();
  const [open, setOpen] = useState(false);

  const { data: assessments } = useQuery({
    queryKey: ["assessments", sectionId, courseId],
    enabled: !!sectionId && !!courseId,
    queryFn: async () => {
      const { data, error } = await supabase.from("assessments")
        .select("*").eq("section_id", sectionId).eq("course_id", courseId).order("due_date", { ascending: true });
      if (error) throw error;
      return data as Assessment[];
    },
  });

  const { data: students } = useQuery({
    queryKey: ["students-in-section", sectionId],
    enabled: !!sectionId,
    queryFn: async () => {
      const { data } = await supabase.from("students")
        .select("id, first_name, last_name, student_code, section_id")
        .eq("section_id", sectionId).order("first_name");
      return (data ?? []) as Student[];
    },
  });

  const { data: scores } = useQuery({
    queryKey: ["scores", sectionId, courseId],
    enabled: !!assessments && assessments.length > 0,
    queryFn: async () => {
      const ids = assessments!.map((a) => a.id);
      const { data } = await supabase.from("assessment_scores").select("*").in("assessment_id", ids);
      return data ?? [];
    },
  });

  async function createAssessment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!sectionId || !courseId) return toast.error("Pick section & course first");
    const section = sections?.find((s) => s.id === sectionId);
    if (!section) return;
    const fd = new FormData(e.currentTarget);
    const payload = {
      campus_id: section.campus_id,
      course_id: courseId,
      section_id: sectionId,
      title: String(fd.get("title")),
      type: (String(fd.get("type") || "quiz")) as Assessment["type"] as never,
      max_marks: Number(fd.get("max_marks") || 100),
      weight_percent: Number(fd.get("weight_percent") || 10),
      due_date: (fd.get("due_date") as string) || null,
      term: String(fd.get("term") || "") || null,
      academic_year: String(fd.get("academic_year") || new Date().getFullYear()),
      created_by: me?.userId ?? null,
    };
    const { error } = await supabase.from("assessments").insert(payload);
    if (error) return toast.error(error.message);
    toast.success("Assessment created");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["assessments", sectionId, courseId] });
  }

  async function saveScore(assessmentId: string, studentId: string, campusId: string, marks: string) {
    const val = marks.trim() === "" ? null : Number(marks);
    const { error } = await supabase.from("assessment_scores").upsert({
      assessment_id: assessmentId, student_id: studentId, campus_id: campusId,
      marks: val, is_absent: false, entered_by: me?.userId ?? null,
    }, { onConflict: "assessment_id,student_id" });
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["scores", sectionId, courseId] });
  }

  const scoreMap = new Map<string, number | null>();
  for (const s of scores ?? []) scoreMap.set(`${s.assessment_id}:${s.student_id}`, s.marks as number | null);

  function studentSummary(studentId: string) {
    if (!assessments || assessments.length === 0) return { percent: 0, grade: "—" };
    let weighted = 0, weightUsed = 0;
    for (const a of assessments) {
      const m = scoreMap.get(`${a.id}:${studentId}`);
      if (m == null) continue;
      const p = (Number(m) / Number(a.max_marks)) * 100;
      weighted += (p * Number(a.weight_percent)) / 100;
      weightUsed += Number(a.weight_percent);
    }
    if (weightUsed === 0) return { percent: 0, grade: "—" };
    const percent = (weighted / weightUsed) * 100;
    const grade = letterFor(percent);
    return { percent, grade };
  }

  const section = sections?.find((s) => s.id === sectionId);

  return (
    <div className="space-y-4">
      <Card className="shadow-none">
        <CardContent className="grid gap-4 p-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Section</Label>
            <Select value={sectionId} onValueChange={setSectionId}>
              <SelectTrigger><SelectValue placeholder="Select section" /></SelectTrigger>
              <SelectContent>
                {sections?.map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.classes?.name ? `${s.classes.name} — ${s.name}` : s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Course</Label>
            <Select value={courseId} onValueChange={setCourseId}>
              <SelectTrigger><SelectValue placeholder="Select course" /></SelectTrigger>
              <SelectContent>
                {courses?.map((c) => <SelectItem key={c.id} value={c.id}>{c.code} · {c.title}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end justify-end">
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button disabled={!sectionId || !courseId}><Plus className="mr-1 h-4 w-4" /> Assessment</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle className="font-serif">New assessment</DialogTitle>
                  <DialogDescription>Define a graded item (quiz, midterm, project…).</DialogDescription>
                </DialogHeader>
                <form onSubmit={createAssessment} className="space-y-3">
                  <div className="space-y-2"><Label>Title</Label><Input name="title" required /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>Type</Label>
                      <Select name="type" defaultValue="quiz">
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="quiz">Quiz</SelectItem>
                          <SelectItem value="assignment">Assignment</SelectItem>
                          <SelectItem value="midterm">Midterm</SelectItem>
                          <SelectItem value="final">Final</SelectItem>
                          <SelectItem value="project">Project</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2"><Label>Due date</Label><Input type="date" name="due_date" /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2"><Label>Max marks</Label><Input type="number" name="max_marks" defaultValue={100} required /></div>
                    <div className="space-y-2"><Label>Weight %</Label><Input type="number" name="weight_percent" defaultValue={10} required /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2"><Label>Term</Label><Input name="term" placeholder="Term 1" /></div>
                    <div className="space-y-2"><Label>Academic year</Label><Input name="academic_year" defaultValue={String(new Date().getFullYear())} /></div>
                  </div>
                  <DialogFooter><Button type="submit">Create</Button></DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </CardContent>
      </Card>

      {sectionId && courseId && (
        <Card className="shadow-none">
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="sticky left-0 bg-background">Student</TableHead>
                  {assessments?.map((a) => (
                    <TableHead key={a.id} className="text-center">
                      <div className="font-medium">{a.title}</div>
                      <div className="text-[10px] font-normal opacity-60">/{a.max_marks} · {a.weight_percent}%</div>
                    </TableHead>
                  ))}
                  <TableHead className="text-center">Total %</TableHead>
                  <TableHead className="text-center">Grade</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(!students || students.length === 0) && (
                  <TableRow><TableCell colSpan={99} className="py-8 text-center text-sm text-muted-foreground">No students in section.</TableCell></TableRow>
                )}
                {students?.map((st) => {
                  const summary = studentSummary(st.id);
                  return (
                    <TableRow key={st.id}>
                      <TableCell className="sticky left-0 bg-background font-medium">
                        <div>{st.first_name} {st.last_name}</div>
                        <div className="text-[10px] text-muted-foreground">{st.student_code}</div>
                      </TableCell>
                      {assessments?.map((a) => {
                        const key = `${a.id}:${st.id}`;
                        const v = scoreMap.get(key);
                        return (
                          <TableCell key={a.id} className="p-1">
                            <Input
                              className="h-8 w-16 text-center"
                              type="number"
                              defaultValue={v ?? ""}
                              onBlur={(e) => saveScore(a.id, st.id, section!.campus_id, e.currentTarget.value)}
                            />
                          </TableCell>
                        );
                      })}
                      <TableCell className="text-center text-sm">{summary.percent.toFixed(1)}%</TableCell>
                      <TableCell className="text-center font-semibold">{summary.grade}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {sectionId && courseId && assessments?.length === 0 && (
        <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
          <Users className="mx-auto mb-2 h-5 w-5" />
          No assessments yet. Create one to start entering grades.
        </div>
      )}
    </div>
  );
}

export function letterFor(percent: number): string {
  if (percent >= 90) return "A+";
  if (percent >= 85) return "A";
  if (percent >= 80) return "A-";
  if (percent >= 75) return "B+";
  if (percent >= 70) return "B";
  if (percent >= 60) return "C";
  if (percent >= 50) return "D";
  return "F";
}

export function gpaFor(percent: number): number {
  if (percent >= 90) return 4.0;
  if (percent >= 85) return 4.0;
  if (percent >= 80) return 3.7;
  if (percent >= 75) return 3.3;
  if (percent >= 70) return 3.0;
  if (percent >= 60) return 2.0;
  if (percent >= 50) return 1.0;
  return 0.0;
}
