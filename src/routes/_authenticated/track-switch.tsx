import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeftRight, Plus } from "lucide-react";
import { useTenantId } from "@/lib/tenant-context";

export const Route = createFileRoute("/_authenticated/track-switch")({
  component: TrackSwitchPage,
});

type Switch = {
  id: string; campus_id: string; student_id: string;
  from_system: string; to_system: string; effective_date: string;
  reason: string | null; created_at: string;
};

const SYSTEMS = [
  { v: "board", l: "Board (BISE)" },
  { v: "cambridge", l: "Cambridge" },
  { v: "both", l: "Both" },
];

function TrackSwitchPage() {
  const [open, setOpen] = useState(false);
  const tenantId = useTenantId();
  const [studentId, setStudentId] = useState("");
  const [toSystem, setToSystem] = useState<"board" | "cambridge" | "both">("cambridge");
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  const [classId, setClassId] = useState("");
  const [sectionId, setSectionId] = useState("");

  const { data: students } = useQuery({
    queryKey: ["students-for-switch"],
    queryFn: async () => (await supabase.from("students")
      .select("id, first_name, last_name, student_code, academic_system, campus_id, class_id, section_id").order("first_name")).data ?? [],
  });
  const { data: campuses } = useQuery({
    queryKey: ["campuses-for-switch"],
    queryFn: async () => (await supabase.from("campuses").select("id,name,academic_system")).data ?? [],
  });
  const { data: classes } = useQuery({
    queryKey: ["classes-for-switch"],
    queryFn: async () => (await supabase.from("classes")
      .select("id,name,campus_id,academic_system").order("name")).data ?? [],
  });
  const { data: sections } = useQuery({
    queryKey: ["sections-for-switch"],
    queryFn: async () => (await supabase.from("sections")
      .select("id,name,class_id,academic_system").order("name")).data ?? [],
  });
  const { data: switches, refetch } = useQuery({
    queryKey: ["track_switches"],
    queryFn: async () => (await supabase.from("track_switches")
      .select("*").order("created_at", { ascending: false })).data as Switch[] ?? [],
  });

  const student = useMemo(() => students?.find((s) => s.id === studentId), [students, studentId]);
  const campusOfStudent = useMemo(() => campuses?.find((c) => c.id === student?.campus_id), [campuses, student]);
  const targetClasses = useMemo(
    () => (classes ?? []).filter((c) =>
      c.campus_id === student?.campus_id &&
      (c.academic_system === toSystem || c.academic_system === "both" || toSystem === "both")),
    [classes, student, toSystem],
  );
  const systemsMatch = (sys?: string | null) =>
    !sys || sys === "both" || toSystem === "both" || sys === toSystem;
  const targetSections = useMemo(
    () => (sections ?? []).filter((s) => s.class_id === classId && systemsMatch(s.academic_system)),
    [sections, classId, toSystem],
  );
  const incompatibleSections = useMemo(
    () => (sections ?? []).filter((s) => s.class_id === classId && !systemsMatch(s.academic_system)).length,
    [sections, classId, toSystem],
  );

  function reset() {
    setStudentId(""); setToSystem("cambridge"); setReason("");
    setClassId(""); setSectionId("");
    setEffectiveDate(new Date().toISOString().slice(0, 10));
  }

  async function submit() {
    if (!studentId) return toast.error("Select a student");
    if (!student) return;
    if (student.academic_system === toSystem) return toast.error("Student is already on this track");
    if (campusOfStudent && campusOfStudent.academic_system !== "both" && campusOfStudent.academic_system !== toSystem && toSystem !== "both") {
      return toast.error(`This campus only supports ${campusOfStudent.academic_system.toUpperCase()}. Switch the campus academic system to "Both" first.`);
    }
    if (!classId) return toast.error(`Select the ${toSystem} class to move the student into`);
    if (sectionId) {
      const sec = sections?.find((s) => s.id === sectionId);
      if (!sec || sec.class_id !== classId) {
        return toast.error("The selected section does not belong to the chosen class");
      }
      if (!systemsMatch(sec.academic_system)) {
        return toast.error(`Section "${sec.name}" is a ${sec.academic_system} section and does not match the ${toSystem} track`);
      }
    }
    if (!tenantId) return toast.error("Tenant not resolved");
    const { error: swErr } = await supabase.from("track_switches").insert({
      tenant_id: tenantId,
      campus_id: student.campus_id, student_id: studentId,
      from_system: student.academic_system, to_system: toSystem,
      effective_date: effectiveDate, reason: reason || null,
    });
    if (swErr) return toast.error(swErr.message);
    const oldSectionId = student.section_id ?? null;
    const newSectionId = sectionId || null;
    const { error: upErr } = await supabase.from("students").update({
      academic_system: toSystem,
      class_id: classId,
      section_id: newSectionId,
    }).eq("id", studentId);
    if (upErr) return toast.error(upErr.message);

    // Propagate to dependent records so attendance, assessments and grading
    // follow the new roster from the effective date onward. History is kept.
    const notes: string[] = [];
    if (oldSectionId !== newSectionId) {
      if (newSectionId) {
        const { count } = await supabase.from("attendance_records")
          .update({ section_id: newSectionId, course_id: null }, { count: "exact" })
          .eq("student_id", studentId)
          .gte("date", effectiveDate)
          .neq("section_id", newSectionId)
          .select("id");
        if (count) notes.push(`${count} attendance record(s) re-pointed`);
      }
      if (oldSectionId) {
        // Drop un-marked scores for the old section's upcoming assessments.
        const { data: staleAssessments } = await supabase.from("assessments")
          .select("id, due_date").eq("section_id", oldSectionId);
        const staleIds = (staleAssessments ?? [])
          .filter((a) => !a.due_date || a.due_date >= effectiveDate)
          .map((a) => a.id);
        if (staleIds.length) {
          const { count } = await supabase.from("assessment_scores")
            .delete({ count: "exact" })
            .eq("student_id", studentId)
            .in("assessment_id", staleIds)
            .is("marks", null)
            .eq("is_absent", false)
            .select("id");
          if (count) notes.push(`${count} pending score row(s) cleared`);
        }
        // Draft report cards should grade against the new section.
        const { count: rcCount } = await supabase.from("report_cards")
          .update({ section_id: newSectionId }, { count: "exact" })
          .eq("student_id", studentId)
          .eq("status", "draft")
          .eq("section_id", oldSectionId)
          .select("id");
        if (rcCount) notes.push(`${rcCount} draft report card(s) moved`);
      }
    }
    toast.success(
      notes.length
        ? `Track switched and roster updated — ${notes.join(", ")}.`
        : "Academic track switched and student moved to the new class",
    );
    setOpen(false); reset(); refetch();
  }


  const nameOf = (id: string) => {
    const s = students?.find((x) => x.id === id);
    return s ? `${s.first_name} ${s.last_name} · ${s.student_code}` : id.slice(0, 8);
  };
  const campusName = (id: string) => campuses?.find((c) => c.id === id)?.name ?? "—";

  return (
    <>
      <PageHeader
        eyebrow="Academics"
        title="Track Switch"
        description="Move a student between Board and Cambridge tracks. Every switch is logged with an effective date and reason."
        actions={
          <Button onClick={() => setOpen(true)}>
            <Plus className="mr-1 h-4 w-4" /> New Switch
          </Button>
        }
      />
      <Card className="shadow-none">
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student</TableHead>
                <TableHead>Campus</TableHead>
                <TableHead>From</TableHead>
                <TableHead></TableHead>
                <TableHead>To</TableHead>
                <TableHead>Effective</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(!switches || switches.length === 0) && (
                <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">No track switches yet.</TableCell></TableRow>
              )}
              {switches?.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="max-w-[220px] truncate">{nameOf(s.student_id)}</TableCell>
                  <TableCell className="text-sm">{campusName(s.campus_id)}</TableCell>
                  <TableCell className="capitalize">{s.from_system}</TableCell>
                  <TableCell><ArrowLeftRight className="h-3 w-3 text-muted-foreground" /></TableCell>
                  <TableCell className="capitalize font-medium">{s.to_system}</TableCell>
                  <TableCell className="text-sm">{s.effective_date}</TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[280px] truncate">{s.reason ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Switch academic track</DialogTitle>
            <DialogDescription>The student record and history log are updated together.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-2">
              <Label>Student *</Label>
              <Select value={studentId} onValueChange={setStudentId}>
                <SelectTrigger><SelectValue placeholder="Select student" /></SelectTrigger>
                <SelectContent>
                  {students?.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.first_name} {s.last_name} · {s.student_code} <span className="text-muted-foreground">({s.academic_system})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {student && (
              <div className="rounded border bg-muted/40 p-3 text-sm">
                <div>Currently on <span className="font-medium capitalize">{student.academic_system}</span></div>
                {campusOfStudent && <div className="text-xs text-muted-foreground">Campus supports: <span className="capitalize">{campusOfStudent.academic_system}</span></div>}
              </div>
            )}
            <div className="space-y-2">
              <Label>Switch to *</Label>
              <Select value={toSystem} onValueChange={(v: any) => { setToSystem(v); setClassId(""); setSectionId(""); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SYSTEMS.map((s) => <SelectItem key={s.v} value={s.v}>{s.l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>New class *</Label>
              <Select value={classId} onValueChange={(v) => { setClassId(v); setSectionId(""); }} disabled={!studentId}>
                <SelectTrigger><SelectValue placeholder={studentId ? "Select class" : "Select a student first"} /></SelectTrigger>
                <SelectContent>
                  {targetClasses.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name} <span className="text-muted-foreground">({c.academic_system})</span></SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {studentId && targetClasses.length === 0 && (
                <p className="text-xs text-destructive">No {toSystem} classes exist for this campus. Create one in Classes &amp; Sections first.</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>New section</Label>
              <Select value={sectionId} onValueChange={setSectionId} disabled={!classId}>
                <SelectTrigger><SelectValue placeholder={classId ? "Select section (optional)" : "Select a class first"} /></SelectTrigger>
                <SelectContent>
                  {targetSections.map((s) => <SelectItem key={s.id} value={s.id}>{s.name} <span className="text-muted-foreground">({s.academic_system})</span></SelectItem>)}
                </SelectContent>
              </Select>
              {classId && targetSections.length === 0 && (
                <p className="text-xs text-destructive">No sections in this class match the {toSystem} track. Leave blank or create a matching section.</p>
              )}
              {classId && incompatibleSections > 0 && targetSections.length > 0 && (
                <p className="text-xs text-muted-foreground">{incompatibleSections} section(s) hidden — they don&apos;t match the {toSystem} track.</p>
              )}


            </div>
            <div className="space-y-2">
              <Label>Effective date *</Label>
              <Input type="date" value={effectiveDate} onChange={(e) => setEffectiveDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Reason</Label>
              <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Parental request, subject availability, exam route change…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit}>Confirm switch</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
