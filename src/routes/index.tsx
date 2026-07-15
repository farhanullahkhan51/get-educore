import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { GraduationCap, ShieldCheck, LineChart, Users } from "lucide-react";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/dashboard" });
  },
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen bg-background">
      <header className="hairline">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-sm bg-primary text-primary-foreground">
              <GraduationCap className="h-4 w-4" />
            </div>
            <span className="font-serif text-lg font-semibold tracking-tight">EduCore</span>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/inquire">
              <Button variant="ghost" size="sm">Apply / Inquire</Button>
            </Link>
            <Link to="/auth">
              <Button variant="outline" size="sm">Sign in</Button>
            </Link>
          </div>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-6 pt-20 pb-16">
          <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
            School & College Management ERP
          </p>
          <h1 className="mt-4 max-w-3xl font-serif text-5xl font-semibold leading-[1.05] tracking-tight md:text-6xl">
            The administrative backbone of a modern institution.
          </h1>
          <p className="mt-6 max-w-2xl text-lg text-muted-foreground">
            EduCore unifies admissions, fees, attendance, results, and certificates across every
            campus — with first-class support for Pakistani Board (BISE) and Cambridge
            O/A-Level tracks.
          </p>
          <div className="mt-8 flex gap-3">
            <Link to="/auth">
              <Button size="lg">Sign in to your institution</Button>
            </Link>
          </div>
        </section>

        <section className="mx-auto max-w-6xl border-t border-border px-6 py-16">
          <div className="grid gap-10 md:grid-cols-3">
            {[
              { icon: Users, title: "Role-scoped access", body: "Principals, campus admins, teachers, finance officers, and students each see only what they need." },
              { icon: ShieldCheck, title: "Institution-grade security", body: "Row-level security on every record. Full audit trail on fees, results, and certificates." },
              { icon: LineChart, title: "Board & Cambridge", body: "One system, two curricula. Track BISE Matric/Inter and O/A-Level registrations side by side." },
            ].map(({ icon: Icon, title, body }) => (
              <div key={title}>
                <Icon className="h-5 w-5 text-primary" />
                <h3 className="mt-3 font-serif text-xl font-semibold">{title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="hairline mt-10">
        <div className="mx-auto max-w-6xl px-6 py-6 text-xs text-muted-foreground">
          © {new Date().getFullYear()} EduCore. Built for institutions.
        </div>
      </footer>
    </div>
  );
}
