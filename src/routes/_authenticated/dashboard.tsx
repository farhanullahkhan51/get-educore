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
            <CardTitle className="font-serif text-lg">Phase 1 · Foundation</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Authentication with role-based access is live. The first account created is Super Admin automatically.</p>
            <p>Manage <strong className="text-foreground">Campuses</strong>, <strong className="text-foreground">Programs</strong>, and <strong className="text-foreground">Classes & Sections</strong> from the sidebar.</p>
            <p>Register <strong className="text-foreground">Students</strong> and <strong className="text-foreground">Staff</strong>, upload documents, and assign portal logins from <strong className="text-foreground">Users & Roles</strong>.</p>
          </CardContent>
        </Card>
        <Card className="shadow-none">
          <CardHeader>
            <CardTitle className="font-serif text-lg">What's next</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            <ul className="space-y-1.5 list-disc pl-5">
              <li>Phase 2 — Admissions inquiry pipeline (Kanban) & one-click registration</li>
              <li>Phase 3 — Fee structures, challans, and bank reconciliation</li>
              <li>Phase 4 — Attendance, gradebook, Board & Cambridge modules</li>
              <li>Phase 5-8 — Certificates, student portal, principal dashboard, AI automations</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
