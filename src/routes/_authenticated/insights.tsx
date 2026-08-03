import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, LineChart, Line, PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  GraduationCap, Users, Wallet, ClipboardCheck, TrendingUp, AlertTriangle, Inbox, Building2,
} from "lucide-react";
import { format, subMonths, startOfMonth } from "date-fns";

export const Route = createFileRoute("/_authenticated/insights")({
  component: Insights,
  head: () => ({
    meta: [
      { title: "Executive Overview · Institution Insights" },
      { name: "description", content: "Cross-campus KPIs for enrollment, attendance, fee collection, admissions and academic performance." },
      { property: "og:title", content: "Executive Overview · Institution Insights" },
      { property: "og:description", content: "Cross-campus KPIs for enrollment, attendance, fee collection, admissions and academic performance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const CURRENCY = (n: number) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(Math.round(n));

const PIE_COLORS = ["hsl(var(--chart-1, 215 40% 30%))", "#8ba3c7", "#c9a227", "#7f9e7f", "#b06a5b", "#8a8f98"];

function Kpi({
  label, value, sub, icon: Icon, tone = "default",
}: {
  label: string; value: string | number; sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "default" | "warn" | "good";
}) {
  return (
    <Card className="shadow-none">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div
          className={
            "mt-3 font-serif text-3xl font-semibold " +
            (tone === "warn" ? "text-destructive" : "")
          }
        >
          {value}
        </div>
        {sub ? <div className="mt-1 text-xs text-muted-foreground">{sub}</div> : null}
      </CardContent>
    </Card>
  );
}

function Insights() {
  const { data: user } = useCurrentUser();
  const isSuper = user?.roles.includes("super_admin") ?? false;
  const [campus, setCampus] = useState<string>("all");

  const { data: campuses } = useQuery({
    queryKey: ["insights-campuses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("campuses").select("id,name,code").order("name");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const scopedCampus = isSuper ? (campus === "all" ? null : campus) : user?.campusId ?? null;

  const since = useMemo(() => startOfMonth(subMonths(new Date(), 5)), []);

  const { data, isLoading } = useQuery({
    queryKey: ["insights", scopedCampus, since.toISOString()],
    queryFn: async () => {
      const scope = <T,>(q: T): T => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        return scopedCampus ? ((q as any).eq("campus_id", scopedCampus) as T) : q;
      };

      const [students, staff, challans, attendance, inquiries] = await Promise.all([
        scope(supabase.from("students").select("id,status,campus_id,program_id,academic_system,gender")),
        scope(supabase.from("staff").select("id,status,campus_id")),
        scope(supabase.from("fee_challans").select("id,campus_id,status,gross_amount,discount_amount,fine_amount,paid_amount,issue_date,due_date")),
        scope(supabase.from("attendance_records").select("id,campus_id,status,date").gte("date", format(since, "yyyy-MM-dd"))),
        scope(supabase.from("inquiries").select("id,campus_id,status,created_at").gte("created_at", since.toISOString())),
      ]);

      const err = students.error || staff.error || challans.error || attendance.error || inquiries.error;
      if (err) throw err;

      return {
        students: students.data ?? [],
        staff: staff.data ?? [],
        challans: challans.data ?? [],
        attendance: attendance.data ?? [],
        inquiries: inquiries.data ?? [],
      };
    },
    enabled: !!user,
  });

  const { data: programs } = useQuery({
    queryKey: ["insights-programs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("programs").select("id,name,campus_id");
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!user,
  });

  const metrics = useMemo(() => {
    const students = data?.students ?? [];
    const staff = data?.staff ?? [];
    const challans = data?.challans ?? [];
    const attendance = data?.attendance ?? [];
    const inquiries = data?.inquiries ?? [];

    const activeStudents = students.filter((s) => (s.status ?? "active") === "active").length;
    const activeStaff = staff.filter((s) => (s.status ?? "active") === "active").length;

    const billed = challans.reduce(
      (a, c) => a + Number(c.gross_amount ?? 0) - Number(c.discount_amount ?? 0) + Number(c.fine_amount ?? 0),
      0,
    );
    const collected = challans.reduce((a, c) => a + Number(c.paid_amount ?? 0), 0);
    const outstanding = Math.max(billed - collected, 0);
    const collectionRate = billed > 0 ? (collected / billed) * 100 : 0;
    const overdue = challans.filter((c) => c.status === "overdue").length;

    const present = attendance.filter((a) => a.status === "present" || a.status === "late").length;
    const attendanceRate = attendance.length > 0 ? (present / attendance.length) * 100 : 0;

    // monthly series
    const months = Array.from({ length: 6 }, (_, i) => startOfMonth(subMonths(new Date(), 5 - i)));
    const monthKey = (d: string | Date) => format(new Date(d), "yyyy-MM");

    const revenueSeries = months.map((m) => {
      const key = format(m, "yyyy-MM");
      const rows = challans.filter((c) => c.issue_date && monthKey(c.issue_date) === key);
      const b = rows.reduce(
        (a, c) => a + Number(c.gross_amount ?? 0) - Number(c.discount_amount ?? 0) + Number(c.fine_amount ?? 0),
        0,
      );
      const p = rows.reduce((a, c) => a + Number(c.paid_amount ?? 0), 0);
      return { month: format(m, "MMM"), Billed: Math.round(b), Collected: Math.round(p) };
    });

    const attendanceSeries = months.map((m) => {
      const key = format(m, "yyyy-MM");
      const rows = attendance.filter((a) => monthKey(a.date) === key);
      const pr = rows.filter((a) => a.status === "present" || a.status === "late").length;
      return {
        month: format(m, "MMM"),
        Attendance: rows.length ? Math.round((pr / rows.length) * 1000) / 10 : 0,
      };
    });

    const funnelOrder = ["new", "contacted", "visited", "converted", "lost"] as const;
    const funnel = funnelOrder.map((s) => ({
      stage: s.charAt(0).toUpperCase() + s.slice(1),
      count: inquiries.filter((i) => i.status === s).length,
    }));
    const conversionRate =
      inquiries.length > 0
        ? (inquiries.filter((i) => i.status === "converted").length / inquiries.length) * 100
        : 0;

    const byProgram = (programs ?? [])
      .map((p) => ({ name: p.name, value: students.filter((s) => s.program_id === p.id).length }))
      .filter((r) => r.value > 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);

    const perCampus = (campuses ?? []).map((c) => {
      const cs = students.filter((s) => s.campus_id === c.id);
      const cc = challans.filter((x) => x.campus_id === c.id);
      const ca = attendance.filter((x) => x.campus_id === c.id);
      const cb = cc.reduce(
        (a, x) => a + Number(x.gross_amount ?? 0) - Number(x.discount_amount ?? 0) + Number(x.fine_amount ?? 0),
        0,
      );
      const cp = cc.reduce((a, x) => a + Number(x.paid_amount ?? 0), 0);
      const cpr = ca.filter((x) => x.status === "present" || x.status === "late").length;
      return {
        id: c.id,
        name: c.name,
        code: c.code,
        students: cs.length,
        staff: staff.filter((s) => s.campus_id === c.id).length,
        outstanding: Math.max(cb - cp, 0),
        collection: cb > 0 ? (cp / cb) * 100 : 0,
        attendance: ca.length ? (cpr / ca.length) * 100 : 0,
      };
    });

    return {
      activeStudents, activeStaff, billed, collected, outstanding, collectionRate, overdue,
      attendanceRate, revenueSeries, attendanceSeries, funnel, conversionRate, byProgram,
      perCampus: scopedCampus ? perCampus.filter((c) => c.id === scopedCampus) : perCampus,
      studentTotal: students.length,
      inquiryTotal: inquiries.length,
    };
  }, [data, programs, campuses, scopedCampus]);

  return (
    <>
      <PageHeader
        eyebrow="INSIGHTS"
        title="Executive Overview"
        description="Institution-wide performance across enrollment, attendance, finance and admissions for the last six months."
      />

      {isSuper ? (
        <div className="mb-6 flex items-center gap-3">
          <Building2 className="h-4 w-4 text-muted-foreground" />
          <Select value={campus} onValueChange={setCampus}>
            <SelectTrigger className="w-64">
              <SelectValue placeholder="All campuses" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All campuses</SelectItem>
              {(campuses ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Active Students"
          value={isLoading ? "—" : metrics.activeStudents}
          sub={`${metrics.studentTotal} on record`}
          icon={GraduationCap}
        />
        <Kpi
          label="Active Staff"
          value={isLoading ? "—" : metrics.activeStaff}
          sub={
            metrics.activeStaff > 0
              ? `1 : ${Math.round(metrics.activeStudents / Math.max(metrics.activeStaff, 1))} student ratio`
              : undefined
          }
          icon={Users}
        />
        <Kpi
          label="Fee Collection"
          value={isLoading ? "—" : `${metrics.collectionRate.toFixed(1)}%`}
          sub={`${CURRENCY(metrics.collected)} of ${CURRENCY(metrics.billed)}`}
          icon={Wallet}
        />
        <Kpi
          label="Attendance (6 mo)"
          value={isLoading ? "—" : `${metrics.attendanceRate.toFixed(1)}%`}
          sub="Present or late over marked days"
          icon={ClipboardCheck}
        />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Kpi
          label="Outstanding Dues"
          value={isLoading ? "—" : CURRENCY(metrics.outstanding)}
          sub={`${metrics.overdue} challans overdue`}
          icon={AlertTriangle}
          tone={metrics.outstanding > 0 ? "warn" : "default"}
        />
        <Kpi
          label="Inquiries (6 mo)"
          value={isLoading ? "—" : metrics.inquiryTotal}
          sub={`${metrics.conversionRate.toFixed(1)}% converted`}
          icon={Inbox}
        />
        <Kpi
          label="Collected"
          value={isLoading ? "—" : CURRENCY(metrics.collected)}
          sub="Received against issued challans"
          icon={TrendingUp}
        />
        <Kpi
          label="Campuses in view"
          value={isLoading ? "—" : metrics.perCampus.length}
          sub={scopedCampus ? "Scoped to your campus" : "All campuses"}
          icon={Building2}
        />
      </div>

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="font-serif text-lg">Billed vs Collected</CardTitle>
            <CardDescription>Last six months, by challan issue month</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={metrics.revenueSeries}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                <XAxis dataKey="month" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis fontSize={12} tickLine={false} axisLine={false} width={70} />
                <Tooltip formatter={(v: number) => CURRENCY(Number(v))} />
                <Legend />
                <Bar dataKey="Billed" fill="#8ba3c7" radius={[2, 2, 0, 0]} />
                <Bar dataKey="Collected" fill="#1f3352" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="font-serif text-lg">Attendance Trend</CardTitle>
            <CardDescription>Monthly present rate (%)</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={metrics.attendanceSeries}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                <XAxis dataKey="month" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis domain={[0, 100]} fontSize={12} tickLine={false} axisLine={false} width={40} />
                <Tooltip formatter={(v: number) => `${v}%`} />
                <Line type="monotone" dataKey="Attendance" stroke="#1f3352" strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="font-serif text-lg">Admissions Funnel</CardTitle>
            <CardDescription>Inquiries received in the last six months</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {metrics.funnel.map((f) => {
              const max = Math.max(...metrics.funnel.map((x) => x.count), 1);
              return (
                <div key={f.stage}>
                  <div className="mb-1 flex items-center justify-between text-sm">
                    <span>{f.stage}</span>
                    <span className="tabular-nums text-muted-foreground">{f.count}</span>
                  </div>
                  <Progress value={(f.count / max) * 100} className="h-2" />
                </div>
              );
            })}
            {metrics.inquiryTotal === 0 ? (
              <p className="text-sm text-muted-foreground">No inquiries recorded in this period.</p>
            ) : null}
          </CardContent>
        </Card>

        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="font-serif text-lg">Enrollment by Program</CardTitle>
            <CardDescription>Top programs by student count</CardDescription>
          </CardHeader>
          <CardContent className="h-72">
            {metrics.byProgram.length === 0 ? (
              <p className="text-sm text-muted-foreground">No enrollment data yet.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={metrics.byProgram} dataKey="value" nameKey="name" innerRadius={50} outerRadius={90} paddingAngle={2}>
                    {metrics.byProgram.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="mt-8 shadow-none">
        <CardHeader>
          <CardTitle className="font-serif text-lg">Campus Comparison</CardTitle>
          <CardDescription>Enrollment, staffing, collection and attendance side by side</CardDescription>
        </CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Campus</TableHead>
                <TableHead className="text-right">Students</TableHead>
                <TableHead className="text-right">Staff</TableHead>
                <TableHead className="text-right">Collection</TableHead>
                <TableHead className="text-right">Outstanding</TableHead>
                <TableHead className="text-right">Attendance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {metrics.perCampus.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                    No campus data available.
                  </TableCell>
                </TableRow>
              ) : (
                metrics.perCampus.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <div className="font-medium">{c.name}</div>
                      <div className="text-xs text-muted-foreground">{c.code}</div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{c.students}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.staff}</TableCell>
                    <TableCell className="text-right tabular-nums">{c.collection.toFixed(1)}%</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {c.outstanding > 0 ? (
                        <Badge variant="outline" className="tabular-nums">{CURRENCY(c.outstanding)}</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{c.attendance.toFixed(1)}%</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
