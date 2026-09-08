import { createFileRoute, Navigate, Link } from "@tanstack/react-router";
import type { LinkProps } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser, roleLabel } from "@/hooks/use-current-user";
import { PageHeader } from "@/components/layout/page-header";
import { EditableGrid } from "@/components/layout/editable";
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
import { useEntitlements } from "@/lib/entitlements";
import { usePlanUsage } from "@/lib/plan-usage";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
  head: () => ({
    meta: [
      { title: "Dashboard · EduCore Institution Overview" },
      { name: "description", content: "Welcome dashboard with cross-campus KPIs for enrollment, attendance, fee collection, admissions and academic performance." },
      { property: "og:title", content: "Dashboard · EduCore Institution Overview" },
      { property: "og:description", content: "Welcome dashboard with cross-campus KPIs for enrollment, attendance, fee collection, admissions and academic performance." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
});

const CURRENCY = (n: number) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(Math.round(n));

const PIE_COLORS = ["hsl(var(--chart-1, 215 40% 30%))", "#8ba3c7", "#c9a227", "#7f9e7f", "#b06a5b", "#8a8f98"];

function Kpi({
  label, value, sub, icon: Icon, tone = "default", to,
}: {
  label: string; value: string | number; sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "default" | "warn" | "good";
  to?: LinkProps["to"];
}) {
  const body = (
    <Card
      className={
        "shadow-none transition-colors " +
        (to ? "cursor-pointer hover:border-primary/40 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" : "")
      }
    >
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

  if (!to) return body;

  return (
    <Link to={to} className="block rounded-lg" aria-label={`Open ${label}`}>
      {body}
    </Link>
  );
}

type DashboardAgg = {
  student_total?: number;
  active_students?: number;
  staff_total?: number;
  active_staff?: number;
  billed?: number;
  collected?: number;
  outstanding?: number;
  overdue?: number;
  attendance_marked?: number;
  attendance_present?: number;
  inquiry_total?: number;
  inquiry_converted?: number;
  revenue_series?: Array<{ month: string; billed: number; collected: number }>;
  attendance_series?: Array<{ month: string; rate: number }>;
  funnel?: Array<{ stage: string; count: number }>;
  by_program?: Array<{ name: string; value: number }>;
  per_campus?: Array<{
    id: string; name: string; code: string;
    students: number; staff: number; outstanding: number; collection: number; attendance: number;
  }>;
};

function Dashboard() {

  const { data: user } = useCurrentUser();
  const isSuper = user?.roles.includes("super_admin") ?? false;
  const [campus, setCampus] = useState<string>("all");
  const ent = useEntitlements();
  const { data: planUsage } = usePlanUsage();

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

  const { data: agg, isLoading } = useQuery({
    queryKey: ["dashboard-metrics", scopedCampus, format(since, "yyyy-MM-dd")],
    queryFn: async (): Promise<DashboardAgg> => {
      const { data, error } = await supabase.rpc("dashboard_metrics", {
        _campus: scopedCampus ?? undefined,
        _since: format(since, "yyyy-MM-dd"),
      });
      if (error) throw error;
      return (data ?? {}) as unknown as DashboardAgg;
    },
    enabled: !!user,
  });

  const metrics = useMemo(() => {
    const a = agg ?? ({} as DashboardAgg);
    const num = (v: unknown) => Number(v ?? 0);

    const billed = num(a.billed);
    const collected = num(a.collected);
    const marked = num(a.attendance_marked);
    const inquiryTotal = num(a.inquiry_total);
    const label = (m: string) => format(new Date(`${m}-01T00:00:00`), "MMM");

    return {
      activeStudents: num(a.active_students),
      activeStaff: num(a.active_staff),
      studentTotal: num(a.student_total),
      billed,
      collected,
      outstanding: num(a.outstanding),
      collectionRate: billed > 0 ? (collected / billed) * 100 : 0,
      overdue: num(a.overdue),
      attendanceRate: marked > 0 ? (num(a.attendance_present) / marked) * 100 : 0,
      revenueSeries: (a.revenue_series ?? []).map((r) => ({
        month: label(r.month),
        Billed: Math.round(num(r.billed)),
        Collected: Math.round(num(r.collected)),
      })),
      attendanceSeries: (a.attendance_series ?? []).map((r) => ({
        month: label(r.month),
        Attendance: num(r.rate),
      })),
      funnel: (a.funnel ?? []).map((f) => ({
        stage: f.stage.charAt(0).toUpperCase() + f.stage.slice(1),
        count: num(f.count),
      })),
      conversionRate: inquiryTotal > 0 ? (num(a.inquiry_converted) / inquiryTotal) * 100 : 0,
      byProgram: (a.by_program ?? []).map((p) => ({ name: p.name, value: num(p.value) })),
      perCampus: (a.per_campus ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        code: c.code,
        students: num(c.students),
        staff: num(c.staff),
        outstanding: num(c.outstanding),
        collection: num(c.collection),
        attendance: num(c.attendance),
      })),
      inquiryTotal,
    };
  }, [agg]);



  if (user?.primaryRole === "student") return <Navigate to="/portal" replace />;

  return (
    <>
      <PageHeader
        eyebrow={`Signed in as ${roleLabel(user?.primaryRole ?? null)}`}
        title={`Welcome, ${user?.fullName ?? user?.email ?? ""}`}
        description="Institution-wide totals, with attendance and admissions trends covering the last six months."
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

      {ent.planName && isSuper ? (
        <Card className="mb-6 shadow-none">
          <CardContent className="flex flex-wrap items-center gap-x-8 gap-y-3 py-4">
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Plan</div>
              <div className="font-serif text-base">{ent.planName}</div>
            </div>
            <div>
              <div className="text-xs uppercase tracking-wide text-muted-foreground">Examination system</div>
              <div className="text-sm">
                {ent.academicSystem === "both" ? "Board & Cambridge" : ent.academicSystem === "board" ? "BISE Board" : "Cambridge"}
              </div>
            </div>
            <PlanUsage
              label="Students"
              used={planUsage?.students_used ?? metrics.studentTotal}
              cap={planUsage?.students_cap ?? ent.limit("student_limit")}
            />
            <PlanUsage
              label="Staff"
              used={planUsage?.staff_used ?? (agg?.staff_total ?? 0)}
              cap={planUsage?.staff_cap ?? ent.limit("staff_limit")}
            />
            <PlanUsage
              label="Campuses"
              used={planUsage?.campuses_used ?? campuses?.length ?? 0}
              cap={planUsage?.campuses_cap ?? ent.limit("campus_limit")}
            />
          </CardContent>
        </Card>
      ) : null}

      <EditableGrid
        scope="dashboard"
        render={(block) => {
          const chartH = block.height === "tall" ? "h-[26rem]" : "h-72";
          switch (block.id) {
            case "kpi-students":
              return (
                <Kpi
                  label={block.label}
                  value={isLoading ? "—" : metrics.activeStudents}
                  sub={`${metrics.studentTotal} on record`}
                  icon={GraduationCap}
                  to="/students"
                />
              );
            case "kpi-staff":
              return (
                <Kpi
                  label={block.label}
                  value={isLoading ? "—" : metrics.activeStaff}
                  sub={
                    metrics.activeStaff > 0
                      ? `1 : ${Math.round(metrics.activeStudents / Math.max(metrics.activeStaff, 1))} student ratio`
                      : undefined
                  }
                  icon={Users}
                  to="/staff"
                />
              );
            case "kpi-collection":
              return (
                <Kpi
                  label={block.label}
                  value={isLoading ? "—" : `${metrics.collectionRate.toFixed(1)}%`}
                  sub={`${CURRENCY(metrics.collected)} of ${CURRENCY(metrics.billed)} · all time`}
                  icon={Wallet}
                  to="/fees"
                />
              );
            case "kpi-attendance":
              return (
                <Kpi
                  label={block.label}
                  value={isLoading ? "—" : `${metrics.attendanceRate.toFixed(1)}%`}
                  sub="Present or late over marked days"
                  icon={ClipboardCheck}
                  to="/academics"
                />
              );
            case "kpi-outstanding":
              return (
                <Kpi
                  label={block.label}
                  value={isLoading ? "—" : CURRENCY(metrics.outstanding)}
                  sub={`${metrics.overdue} challans overdue · all time`}
                  icon={AlertTriangle}
                  to="/fees"
                  tone={metrics.outstanding > 0 ? "warn" : "default"}
                />
              );
            case "kpi-inquiries":
              return (
                <Kpi
                  label={block.label}
                  value={isLoading ? "—" : metrics.inquiryTotal}
                  sub={`${metrics.conversionRate.toFixed(1)}% converted`}
                  icon={Inbox}
                  to="/admissions"
                />
              );
            case "kpi-collected":
              return (
                <Kpi
                  label={block.label}
                  value={isLoading ? "—" : CURRENCY(metrics.collected)}
                  sub="Received against issued challans · all time"
                  icon={TrendingUp}
                  to="/fees"
                />
              );
            case "kpi-campuses":
              return (
                <Kpi
                  label={block.label}
                  value={isLoading ? "—" : metrics.perCampus.length}
                  sub={scopedCampus ? "Scoped to your campus" : "All campuses"}
                  icon={Building2}
                  to="/campuses"
                />
              );
            case "chart-revenue":
              return (
                <Card className="h-full shadow-none">
                  <CardHeader>
                    <CardTitle className="font-serif text-lg">{block.label}</CardTitle>
                    <CardDescription>Last six months, by challan issue month</CardDescription>
                  </CardHeader>
                  <CardContent className={chartH}>
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
              );
            case "chart-attendance":
              return (
                <Card className="h-full shadow-none">
                  <CardHeader>
                    <CardTitle className="font-serif text-lg">{block.label}</CardTitle>
                    <CardDescription>Monthly present rate (%)</CardDescription>
                  </CardHeader>
                  <CardContent className={chartH}>
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
              );
            case "chart-funnel":
              return (
                <Card className="h-full shadow-none">
                  <CardHeader>
                    <CardTitle className="font-serif text-lg">{block.label}</CardTitle>
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
              );
            case "chart-programs":
              return (
                <Card className="h-full shadow-none">
                  <CardHeader>
                    <CardTitle className="font-serif text-lg">{block.label}</CardTitle>
                    <CardDescription>Top programs by student count</CardDescription>
                  </CardHeader>
                  <CardContent className={chartH}>
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
              );
            case "table-campuses":
              return (
                <Card className="h-full shadow-none">
                  <CardHeader>
                    <CardTitle className="font-serif text-lg">{block.label}</CardTitle>
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
              );
            default:
              return null;
          }
        }}
      />
    </>
  );
}

function PlanUsage({ label, used, cap }: { label: string; used: number; cap: number | null }) {
  const pct = cap ? Math.min(100, Math.round((used / cap) * 100)) : 0;
  return (
    <div className="min-w-32">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-sm">
        {used}
        <span className="text-muted-foreground"> / {cap ?? "Unlimited"}</span>
      </div>
      {cap ? (
        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={pct >= 90 ? "h-full bg-destructive" : "h-full bg-primary"}
            style={{ width: `${pct}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}
