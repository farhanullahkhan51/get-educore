import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EditableTabs } from "@/components/layout/editable";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { CalendarCheck, Wallet, Award, FileText, CalendarClock } from "lucide-react";
import { FeatureGate } from "@/components/layout/feature-gate";
import { NoticeFeed } from "@/components/layout/notice-feed";

export const Route = createFileRoute("/_authenticated/portal")({
  head: () => ({
    meta: [
      { title: "My Portal | Student Dashboard" },
      { name: "description", content: "View your attendance, fee challans, results, deadlines and certificates in one place." },
      { property: "og:title", content: "My Portal | Student Dashboard" },
      { property: "og:description", content: "Your attendance, fees, results, deadlines and certificates." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: GatedStudentPortalPage,
});

function StudentPortalPage() {
  const { data: user } = useCurrentUser();

  const { data: student, isLoading: studentLoading } = useQuery({
    queryKey: ["portal-student", user?.userId],
    enabled: !!user?.userId,
    queryFn: async () => {
      const { data } = await supabase
        .from("students")
        .select("*")
        .eq("profile_id", user!.userId)
        .maybeSingle();
      return data;
    },
  });

  const studentId = student?.id;

  const { data: attendance } = useQuery({
    queryKey: ["portal-att", studentId],
    enabled: !!studentId,
    queryFn: async () => (await supabase.from("attendance_records")
      .select("id,date,status,remarks,course:course_id(code,title)")
      .eq("student_id", studentId!)
      .order("date", { ascending: false })
      .limit(500)).data ?? [],
  });

  const { data: challans } = useQuery({
    queryKey: ["portal-fee", studentId],
    enabled: !!studentId,
    queryFn: async () => (await supabase.from("fee_challans")
      .select("id,challan_no,category,period_label,issue_date,due_date,gross_amount,discount_amount,fine_amount,paid_amount,status,paid_on")
      .eq("student_id", studentId!)
      .order("issue_date", { ascending: false })).data ?? [],
  });

  // Students only ever see published report cards (drafts stay internal).
  const { data: reports } = useQuery({
    queryKey: ["portal-rc", studentId],
    enabled: !!studentId,
    queryFn: async () => (await supabase.from("report_cards")
      .select("id,term,academic_year,subjects,overall_percent,attendance_percent,remarks,published_at")
      .eq("student_id", studentId!)
      .eq("status", "published")
      .order("created_at", { ascending: false })).data ?? [],
  });

  const { data: scores } = useQuery({
    queryKey: ["portal-scores", studentId],
    enabled: !!studentId,
    queryFn: async () => (await supabase.from("assessment_scores")
      .select("id,marks,is_absent,assessment:assessment_id(title,type,max_marks,due_date,term,academic_year)")
      .eq("student_id", studentId!)
      .order("created_at", { ascending: false })
      .limit(100)).data ?? [],
  });

  // Upcoming deadlines for the student's own section only.
  const { data: deadlines } = useQuery({
    queryKey: ["portal-deadlines", student?.section_id],
    enabled: !!student?.section_id,
    queryFn: async () => (await supabase.from("assessments")
      .select("id,title,type,max_marks,due_date,term,course:course_id(code,title)")
      .eq("section_id", student!.section_id!)
      .gte("due_date", new Date().toISOString().slice(0, 10))
      .order("due_date", { ascending: true })
      .limit(20)).data ?? [],
  });

  const { data: certs } = useQuery({
    queryKey: ["portal-certs", studentId],
    enabled: !!studentId,
    queryFn: async () => (await supabase.from("certificates")
      .select("id,serial_no,title,type,issue_date,status")
      .eq("student_id", studentId!)
      .eq("status", "issued")
      .order("issue_date", { ascending: false })).data ?? [],
  });

  const courseLabel = (c: { code?: string | null; title?: string | null } | null | undefined) =>
    c ? `${c.code ?? ""}${c.code && c.title ? " · " : ""}${c.title ?? ""}` || "—" : "—";

  const marksFor = (subjects: unknown) => {
    if (!Array.isArray(subjects)) return null;
    let obtained = 0;
    let max = 0;
    for (const s of subjects as Array<Record<string, unknown>>) {
      obtained += Number(s.obtained ?? s.marks ?? 0) || 0;
      max += Number(s.max ?? s.max_marks ?? s.total ?? 0) || 0;
    }
    return max ? { obtained, max } : null;
  };

  const attStats = useMemo(() => {
    const list = attendance ?? [];
    const total = list.length;
    const present = list.filter((r) => r.status === "present" || r.status === "late").length;
    const pct = total ? Math.round((present / total) * 100) : 0;
    return { total, present, pct };
  }, [attendance]);

  const feeStats = useMemo(() => {
    const list = challans ?? [];
    const balances = list.map((c) => ({
      challan: c,
      balance: Math.max(Number(c.gross_amount) - Number(c.discount_amount ?? 0) + Number(c.fine_amount ?? 0) - Number(c.paid_amount ?? 0), 0),
    }));
    const outstanding = balances.reduce((sum, item) => item.challan.status === "waived" ? sum : sum + item.balance, 0);
    const unpaid = balances.filter((item) => item.challan.status !== "waived" && item.balance > 0).length;
    return { outstanding, unpaid };
  }, [challans]);

  if (studentLoading) {
    return <div className="text-sm text-muted-foreground">Loading your portal…</div>;
  }

  if (!student) {
    return (
      <>
        <PageHeader
          eyebrow="Student Portal"
          title="Portal not linked yet"
          description="Your account isn't linked to a student profile."
        />
        <Card className="shadow-none">
          <CardContent className="p-6 text-sm text-muted-foreground">
            Please ask your campus administrator to link your login to your student record so you can view attendance,
            fees, results and certificates here.
          </CardContent>
        </Card>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Student Portal"
        title={`Welcome, ${student.first_name} ${student.last_name}`}
        description={`Student ID ${student.student_code}${student.grade ? ` · ${student.grade}` : ""}`}
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-6">
        <Kpi label="Attendance" value={`${attStats.pct}%`} sub={`${attStats.present}/${attStats.total} days`} icon={CalendarCheck} />
        <Kpi label="Outstanding fees" value={feeStats.outstanding.toLocaleString()} sub={`${feeStats.unpaid} unpaid challan(s)`} icon={Wallet} />
        <Kpi label="Report cards" value={reports?.length ?? 0} sub="Terms recorded" icon={FileText} />
        <Kpi label="Certificates" value={certs?.length ?? 0} sub="Issued to you" icon={Award} />
      </div>

      <div className="mb-6">
        <NoticeFeed limit={3} showLink={false} title="Notices from your school" />
      </div>

      <EditableTabs scope="module:portal" fallback="attendance" listClassName="flex-wrap h-auto">

        <TabsContent value="deadlines">
          <Card className="shadow-none">
            <CardHeader>
              <CardTitle className="text-base font-serif flex items-center gap-2">
                <CalendarClock className="h-4 w-4" /> Upcoming assessments
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Due</TableHead>
                    <TableHead>Assessment</TableHead>
                    <TableHead>Course</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Max marks</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(deadlines ?? []).length === 0 && (
                    <TableRow><TableCell colSpan={5} className="py-8 text-center text-sm text-muted-foreground">No upcoming deadlines.</TableCell></TableRow>
                  )}
                  {(deadlines ?? []).map((a: any) => (
                    <TableRow key={a.id}>
                      <TableCell className="text-sm">{a.due_date ? new Date(a.due_date).toLocaleDateString() : "—"}</TableCell>
                      <TableCell className="text-sm">{a.title}</TableCell>
                      <TableCell className="text-sm">{courseLabel(a.course)}</TableCell>
                      <TableCell className="text-sm capitalize">{a.type}</TableCell>
                      <TableCell className="text-right text-sm">{a.max_marks ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>


        <TabsContent value="attendance">
          <Card className="shadow-none">
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Course</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Remarks</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(attendance ?? []).length === 0 && (
                    <TableRow><TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">No attendance recorded yet.</TableCell></TableRow>
                  )}
                  {(attendance ?? []).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-sm">{new Date(r.date).toLocaleDateString()}</TableCell>
                      <TableCell className="text-sm">{courseLabel(r.course)}</TableCell>
                      <TableCell>
                        <Badge variant={r.status === "present" ? "secondary" : r.status === "absent" ? "destructive" : "outline"}>
                          {r.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{r.remarks ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="fees">
          <Card className="shadow-none">
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Challan</TableHead>
                    <TableHead>Period</TableHead>
                    <TableHead>Issued</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead className="text-right">Payable</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(challans ?? []).length === 0 && (
                    <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">No fee challans yet.</TableCell></TableRow>
                  )}
                  {(challans ?? []).map((c) => {
                    const payable = Math.max(Number(c.gross_amount) - Number(c.discount_amount ?? 0) + Number(c.fine_amount ?? 0), 0);
                    const balance = Math.max(payable - Number(c.paid_amount ?? 0), 0);
                    const effectiveStatus = c.status !== "waived" && balance > 0 && c.due_date < new Date().toISOString().slice(0, 10) ? "overdue" : c.status;
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="font-mono text-xs">{c.challan_no}</TableCell>
                        <TableCell className="text-sm">{c.period_label ?? c.category ?? "—"}</TableCell>
                        <TableCell className="text-sm">{new Date(c.issue_date).toLocaleDateString()}</TableCell>
                        <TableCell className="text-sm">{c.due_date ? new Date(c.due_date).toLocaleDateString() : "—"}</TableCell>
                        <TableCell className="text-right text-sm">{payable.toLocaleString()}</TableCell>
                        <TableCell className="text-right text-sm">{Number(c.paid_amount ?? 0).toLocaleString()}</TableCell>
                        <TableCell>
                          <Badge variant={effectiveStatus === "paid" ? "secondary" : effectiveStatus === "overdue" ? "destructive" : "outline"}>
                            {effectiveStatus}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="results">
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="shadow-none">
              <CardHeader><CardTitle className="text-base font-serif">Report cards</CardTitle></CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Term</TableHead>
                      <TableHead>Year</TableHead>
                      <TableHead className="text-right">Marks</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(reports ?? []).length === 0 && (
                      <TableRow><TableCell colSpan={3} className="py-6 text-center text-sm text-muted-foreground">No report cards published yet.</TableCell></TableRow>
                    )}
                    {(reports ?? []).map((r: any) => {
                      const m = marksFor(r.subjects);
                      return (
                        <TableRow key={r.id}>
                          <TableCell className="text-sm">{r.term ?? "—"}</TableCell>
                          <TableCell className="text-sm">{r.academic_year ?? "—"}</TableCell>
                          <TableCell className="text-right text-sm">
                            {m ? `${m.obtained} / ${m.max}` : r.overall_percent != null ? `${r.overall_percent}%` : "—"}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card className="shadow-none">
              <CardHeader><CardTitle className="text-base font-serif">Recent assessments</CardTitle></CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Assessment</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Marks</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(scores ?? []).length === 0 && (
                      <TableRow><TableCell colSpan={3} className="py-6 text-center text-sm text-muted-foreground">No scores recorded yet.</TableCell></TableRow>
                    )}
                    {(scores ?? []).map((s: any) => (
                      <TableRow key={s.id}>
                        <TableCell className="text-sm">{s.assessment?.title ?? "—"}</TableCell>
                        <TableCell className="text-sm capitalize">{s.assessment?.type ?? "—"}</TableCell>
                        <TableCell className="text-right text-sm">
                          {s.is_absent ? <span className="text-destructive">Absent</span> :
                            s.assessment?.max_marks != null ? `${s.marks ?? 0} / ${s.assessment.max_marks}` : s.marks ?? "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="certificates">
          <Card className="shadow-none">
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Serial</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Issued</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(certs ?? []).length === 0 && (
                    <TableRow><TableCell colSpan={4} className="py-8 text-center text-sm text-muted-foreground">No certificates issued to you.</TableCell></TableRow>
                  )}
                  {(certs ?? []).map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-xs">{c.serial_no}</TableCell>
                      <TableCell className="text-sm">{c.title}</TableCell>
                      <TableCell className="text-sm">{new Date(c.issue_date).toLocaleDateString()}</TableCell>
                      <TableCell>
                        <Badge variant={c.status === "issued" ? "secondary" : c.status === "revoked" ? "destructive" : "outline"}>
                          {c.status}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="profile">
          <Card className="shadow-none">
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 p-6 text-sm">
              <Row label="Full name" value={`${student.first_name} ${student.last_name}`} />
              <Row label="Student ID" value={student.student_code} />
              <Row label="Grade / Class" value={student.grade ?? "—"} />
              <Row label="Academic system" value={student.academic_system ?? "—"} />
              <Row label="Date of birth" value={student.date_of_birth ? new Date(student.date_of_birth).toLocaleDateString() : "—"} />
              <Row label="Gender" value={student.gender ?? "—"} />
              <Row label="Guardian" value={student.guardian_name ?? "—"} />
              <Row label="Guardian phone" value={student.guardian_phone ?? "—"} />
              <Row label="Guardian occupation" value={student.guardian_occupation ?? "—"} />
              <Row label="Admission date" value={student.admission_date ? new Date(student.admission_date).toLocaleDateString() : "—"} />
              <Row label="Status" value={student.status ?? "—"} />
              <Row label="Address" value={student.address ?? "—"} />
            </CardContent>
          </Card>
        </TabsContent>
      </EditableTabs>
    </>
  );
}

function Kpi({ label, value, sub, icon: Icon }: { label: string; value: string | number; sub?: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <Card className="shadow-none">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="mt-3 font-serif text-3xl font-semibold">{value}</div>
        {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex flex-col">
      <span className="text-xs uppercase tracking-widest text-muted-foreground">{label}</span>
      <span className="font-medium">{value ?? "—"}</span>
    </div>
  );
}

function GatedStudentPortalPage() {
  return (
    <FeatureGate feature="portal" title="Student Portal">
      <StudentPortalPage />
    </FeatureGate>
  );
}
