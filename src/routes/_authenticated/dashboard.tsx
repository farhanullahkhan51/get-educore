import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useCurrentUser, roleLabel } from "@/hooks/use-current-user";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Building2, GraduationCap, Users, BookOpen } from "lucide-react";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: Dashboard,
});

function Kpi({ label, value, icon: Icon }: { label: string; value: string | number; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <Card className="shadow-none">
      <CardContent className="p-5">
        <div className="flex items-center justify-between">
          <div className="text-xs uppercase tracking-widest text-muted-foreground">{label}</div>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="mt-3 font-serif text-3xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}

function Dashboard() {
  const { data: user } = useCurrentUser();
  if (user?.primaryRole === "student") return <Navigate to="/portal" replace />;

  const { data: counts } = useQuery({
    queryKey: ["dash-counts", user?.primaryRole, user?.campusId],
    queryFn: async () => {
      const [campuses, students, staff, programs] = await Promise.all([
        supabase.from("campuses").select("id", { count: "exact", head: true }),
        supabase.from("students").select("id", { count: "exact", head: true }),
        supabase.from("staff").select("id", { count: "exact", head: true }),
        supabase.from("programs").select("id", { count: "exact", head: true }),
      ]);
      return {
        campuses: campuses.count ?? 0,
        students: students.count ?? 0,
        staff: staff.count ?? 0,
        programs: programs.count ?? 0,
      };
    },
    enabled: !!user,
  });

  return (
    <>
      <PageHeader
        eyebrow={`Signed in as ${roleLabel(user?.primaryRole ?? null)}`}
        title={`Welcome, ${user?.fullName ?? user?.email ?? ""}`}
        description="At-a-glance view of your institution. Use the sidebar to manage campuses, programs, students, and staff."
      />

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Kpi label="Campuses" value={counts?.campuses ?? "—"} icon={Building2} />
        <Kpi label="Students" value={counts?.students ?? "—"} icon={GraduationCap} />
        <Kpi label="Staff" value={counts?.staff ?? "—"} icon={Users} />
        <Kpi label="Programs" value={counts?.programs ?? "—"} icon={BookOpen} />
      </div>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="font-serif text-lg">Executive Overview</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>Leadership analytics across enrollment, attendance, fee collection and the admissions funnel — with campus-by-campus comparison.</p>
            <Link to="/insights" className="inline-flex items-center gap-2 text-sm font-medium text-foreground underline underline-offset-4">
              Open Executive Overview
            </Link>
          </CardContent>
        </Card>
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="font-serif text-lg">Quick links</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <ul className="space-y-1.5 list-disc pl-5">
              <li><Link to="/admissions" className="text-foreground underline underline-offset-4">Admissions pipeline</Link> — inquiries and one-click registration</li>
              <li><Link to="/fees" className="text-foreground underline underline-offset-4">Fees &amp; Finance</Link> — challans, scholarships, reconciliation</li>
              <li><Link to="/academics" className="text-foreground underline underline-offset-4">Academics</Link> — attendance and gradebook</li>
              <li><Link to="/certificates" className="text-foreground underline underline-offset-4">Certificates</Link> — issue and manage documents</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
