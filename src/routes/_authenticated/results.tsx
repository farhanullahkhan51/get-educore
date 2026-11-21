import { gradeForTrack, trackOf } from "@/lib/grading";
import { createFileRoute } from "@tanstack/react-router";
import { escapeDeep, escapeHtml } from "@/lib/html-escape";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { FileText, Printer, CheckCircle2, Loader2 } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { letterFor, gpaFor } from "./academics";
import { getActiveTenantName } from "@/lib/tenant-context";

export const Route = createFileRoute("/_authenticated/results")({
  component: ResultsPage,
});

type ReportCard = {
  id: string; campus_id: string; student_id: string; section_id: string | null;
  term: string; academic_year: string; status: "draft" | "published" | "locked";
  subjects: any; gpa: number | null; overall_percent: number | null;
  attendance_percent: number | null; remarks: string | null; published_at: string | null;
};

function ResultsPage() {
  const qc = useQueryClient();
  const { data: me } = useCurrentUser();
  const [sectionId, setSectionId] = useState("");
  const [term, setTerm] = useState("Term 1");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [busy, setBusy] = useState(false);

  const { data: sections } = useQuery({
    queryKey: ["sections-with-class"],
    queryFn: async () => (await supabase.from("sections").select("id, name, campus_id, class_id, classes(name)")).data ?? [],
  });

  const { data: cards, refetch } = useQuery({
    queryKey: ["report_cards", sectionId, term, year],
    enabled: !!sectionId,
    queryFn: async () => {
      const { data, error } = await supabase.from("report_cards")
        .select("*").eq("section_id", sectionId).eq("term", term).eq("academic_year", year);
      if (error) throw error;
      return data as ReportCard[];
    },
  });

  const { data: students } = useQuery({
    queryKey: ["students-in-section", sectionId],
    enabled: !!sectionId,
    queryFn: async () => (await supabase.from("students")
      .select("id, first_name, last_name, student_code, section_id, academic_system")
      .eq("section_id", sectionId).order("first_name")).data ?? [],
  });

  async function generate() {
    if (!sectionId) return toast.error("Pick a section");
    const section = sections?.find((s: any) => s.id === sectionId);
    if (!section || !students) return;
    setBusy(true);
    try {
      for (const st of students) {
        // Fetch assessments + scores for this section, this academic year
        const { data: assessments } = await supabase.from("assessments")
          .select("*").eq("section_id", sectionId).eq("academic_year", year);
        const asmts = assessments ?? [];
        const { data: scores } = await supabase.from("assessment_scores")
          .select("*").eq("student_id", st.id).in("assessment_id", asmts.map((a) => a.id));
        const scoreMap = new Map((scores ?? []).map((s) => [s.assessment_id, s.marks]));

        // Group by course
        const byCourse: Record<string, { weighted: number; weight: number; maxWeight: number; obtained: number; total: number }> = {};
        for (const a of asmts) {
          const m = scoreMap.get(a.id);
          if (m == null) continue;
          const p = (Number(m) / Number(a.max_marks)) * 100;
          const c = byCourse[a.course_id] ?? { weighted: 0, weight: 0, maxWeight: 0, obtained: 0, total: 0 };
          c.weighted += (p * Number(a.weight_percent)) / 100;
          c.weight += Number(a.weight_percent);
          c.maxWeight += Number(a.weight_percent);
          c.obtained += Number(m);
          c.total += Number(a.max_marks);
          byCourse[a.course_id] = c;
        }
        // Fetch course titles
        const courseIds = Object.keys(byCourse);
        const { data: courseRows } = courseIds.length
          ? await supabase.from("courses").select("id, code, title").in("id", courseIds)
          : { data: [] };
        const courseMap = new Map((courseRows ?? []).map((c) => [c.id, c]));

        const subjects = courseIds.map((cid) => {
          const c = byCourse[cid];
          const percent = c.weight > 0 ? (c.weighted / c.weight) * 100 : 0;
          const info = courseMap.get(cid);
          return {
            course_id: cid,
            code: info?.code ?? "",
            title: info?.title ?? "",
            percent: Number(percent.toFixed(2)),
            grade: gradeForTrack(percent, trackOf(st.academic_system)) ?? letterFor(percent),
            gpa: gpaFor(percent),
            marks_obtained: Number(c.obtained.toFixed(2)),
            marks_total: Number(c.total.toFixed(2)),
          };
        });

        const overall = subjects.length
          ? subjects.reduce((s, x) => s + x.percent, 0) / subjects.length : 0;
        const gpa = subjects.length
          ? subjects.reduce((s, x) => s + x.gpa, 0) / subjects.length : 0;




        // Attendance %
        const { data: att } = await supabase.from("attendance_records")
          .select("status").eq("student_id", st.id).eq("section_id", sectionId);
        const total = (att ?? []).length;
        const present = (att ?? []).filter((r) => r.status === "present" || r.status === "late").length;
        const attPct = total > 0 ? (present / total) * 100 : 0;

        await supabase.from("report_cards").upsert({
          campus_id: section.campus_id,
          student_id: st.id,
          section_id: sectionId,
          term, academic_year: year,
          status: "draft",
          subjects,
          gpa: Number(gpa.toFixed(2)),
          overall_percent: Number(overall.toFixed(2)),
          attendance_percent: Number(attPct.toFixed(2)),
          generated_by: me?.userId ?? null,
        }, { onConflict: "student_id,term,academic_year" });
      }
      toast.success(`Generated report cards for ${students.length} students`);
      refetch();
    } catch (e: any) {
      toast.error(e.message);
    } finally { setBusy(false); }
  }

  async function publishAll() {
    if (!cards) return;
    const ids = cards.filter((c) => c.status !== "published").map((c) => c.id);
    if (ids.length === 0) return toast.info("All cards already published");
    const { error } = await supabase.from("report_cards").update({
      status: "published", published_at: new Date().toISOString(),
    }).in("id", ids);
    if (error) return toast.error(error.message);
    toast.success(`Published ${ids.length} report cards`);
    qc.invalidateQueries({ queryKey: ["report_cards"] });
  }

  function printCard(rawCard: ReportCard) {
    const card = escapeDeep(rawCard);
    const st = escapeDeep(students?.find((s) => s.id === card.student_id));
    const section: any = escapeDeep(sections?.find((s: any) => s.id === sectionId));
    const subs = card.subjects as any[];
    const rows = subs.map((s) => `
      <tr>
        <td>${s.code}</td>
        <td>${s.title}</td>
        <td style="text-align:center">${(s.marks_obtained ?? 0).toFixed(0)} / ${(s.marks_total ?? 0).toFixed(0)}</td>
        <td style="text-align:center">${s.percent.toFixed(1)}%</td>
        <td style="text-align:center;font-weight:600">${s.grade}</td>
      </tr>`).join("");
    const totalObtained = subs.reduce((a, x) => a + (Number(x.marks_obtained) || 0), 0);
    const totalMax = subs.reduce((a, x) => a + (Number(x.marks_total) || 0), 0);
    const w = window.open("", "_blank", "width=900,height=1000");
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>Report Card - ${st?.first_name} ${st?.last_name}</title>
      <meta name="color-scheme" content="light only">
      <style>
        :root { color-scheme: light; }
        html, body { background: #ffffff !important; color: #111111 !important; }
        body { font-family: Georgia, serif; padding: 40px; }
        .h { text-align: center; border-bottom: 2px solid #111; padding-bottom: 12px; margin-bottom: 20px; }
        .h h1 { margin: 0; font-size: 22px; letter-spacing: 3px; color:#111; }
        .h .sub { font-size: 11px; text-transform: uppercase; letter-spacing: 4px; color:#555; }
        .meta { display: flex; justify-content: space-between; margin: 16px 0; font-size: 13px; color:#111; }
        table { width: 100%; border-collapse: collapse; margin-top: 12px; color:#111; }
        th, td { border: 1px solid #999; padding: 8px 10px; font-size: 13px; background:#ffffff; color:#111; }
        th { background: #f4f4f4 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .totals { margin-top: 20px; display: grid; grid-template-columns: repeat(3,1fr); gap: 12px; }
        .stat { border: 1px solid #999; padding: 10px; background:#ffffff; color:#111; }
        .stat .lbl { font-size:10px; text-transform: uppercase; letter-spacing:2px; color:#555; }
        .stat .val { font-size: 20px; font-weight: 600; margin-top:4px; color:#111; }
        .sig { margin-top: 60px; display: flex; justify-content: space-between; font-size: 12px; color:#111; }
        .sig div { border-top: 1px solid #111; padding-top: 6px; width: 30%; text-align: center; }
        @media print {
          html, body { background:#ffffff !important; color:#111111 !important; }
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
        }
      </style></head><body>
      <div class="h">
        <div class="sub">${escapeHtml(getActiveTenantName())} Academic Report</div>
        <h1>REPORT CARD</h1>
        <div class="sub">${card.term} · ${card.academic_year}</div>
      </div>
      <div class="meta">
        <div><b>${st?.first_name} ${st?.last_name}</b><br/><span style="color:#666">${st?.student_code}</span></div>
        <div style="text-align:right">${section?.classes?.name ?? ""} — ${section?.name ?? ""}</div>
      </div>
      <table>
        <thead><tr><th>Code</th><th>Subject</th><th>Marks</th><th>%</th><th>Grade</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5" style="text-align:center">No subjects</td></tr>'}</tbody>
      </table>
      <div class="totals">
        <div class="stat"><div class="lbl">Total Marks</div><div class="val">${totalObtained.toFixed(0)} / ${totalMax.toFixed(0)}</div></div>
        <div class="stat"><div class="lbl">Overall %</div><div class="val">${(card.overall_percent ?? 0).toFixed(1)}%</div></div>
        <div class="stat"><div class="lbl">Attendance</div><div class="val">${(card.attendance_percent ?? 0).toFixed(1)}%</div></div>
      </div>
      <div class="sig"><div>Class Teacher</div><div>Principal</div><div>Parent</div></div>
      </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 400);
  }


  const cardByStudent = new Map(cards?.map((c) => [c.student_id, c]));

  return (
    <>
      <PageHeader
        eyebrow="Academics"
        title="Results & Report Cards"
        description="Generate report cards from gradebook and attendance data, then publish to the student portal."
      />

      <Card className="mb-4 shadow-none">
        <CardContent className="space-y-4 p-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-2 sm:col-span-2">
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
            <div className="space-y-2"><Label>Term</Label><Input value={term} onChange={(e) => setTerm(e.target.value)} /></div>
            <div className="space-y-2"><Label>Academic year</Label><Input value={year} onChange={(e) => setYear(e.target.value)} /></div>
          </div>
          <div className="flex flex-wrap gap-2 border-t pt-4">
            <Button onClick={generate} disabled={!sectionId || busy}>
              {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <FileText className="mr-1 h-4 w-4" />}
              Generate
            </Button>
            <Button variant="outline" onClick={publishAll} disabled={!cards || cards.length === 0}>
              <CheckCircle2 className="mr-1 h-4 w-4" /> Publish
            </Button>
          </div>
        </CardContent>
      </Card>

      {sectionId && (
        <Card className="shadow-none">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Marks</TableHead>
                  <TableHead>Overall %</TableHead>
                  <TableHead>Attendance</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(!students || students.length === 0) && (
                  <TableRow><TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">No students in section.</TableCell></TableRow>
                )}
                {students?.map((st) => {
                  const c = cardByStudent.get(st.id);
                  const subs = (c?.subjects as any[]) ?? [];
                  const obtained = subs.reduce((a, x) => a + (Number(x.marks_obtained) || 0), 0);
                  const total = subs.reduce((a, x) => a + (Number(x.marks_total) || 0), 0);
                  return (
                    <TableRow key={st.id}>
                      <TableCell>
                        <div className="font-medium">{st.first_name} {st.last_name}</div>
                        <div className="text-[10px] text-muted-foreground">{st.student_code}</div>
                      </TableCell>
                      <TableCell>{c ? `${obtained.toFixed(0)} / ${total.toFixed(0)}` : "—"}</TableCell>
                      <TableCell>{c ? `${(c.overall_percent ?? 0).toFixed(1)}%` : "—"}</TableCell>

                      <TableCell>{c ? `${(c.attendance_percent ?? 0).toFixed(1)}%` : "—"}</TableCell>
                      <TableCell>
                        {c ? (
                          <span className={`rounded px-2 py-0.5 text-xs uppercase tracking-wide ${
                            c.status === "published" ? "bg-emerald-100 text-emerald-800" :
                            c.status === "locked" ? "bg-slate-200 text-slate-800" : "bg-amber-100 text-amber-800"
                          }`}>{c.status}</span>
                        ) : <span className="text-xs text-muted-foreground">Not generated</span>}
                      </TableCell>
                      <TableCell className="text-right">
                        {c && (
                          <Button size="sm" variant="ghost" onClick={() => printCard(c)}>
                            <Printer className="mr-1 h-4 w-4" /> Print
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </>
  );
}
