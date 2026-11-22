import { Link } from "@tanstack/react-router";
import { GraduationCap, ClipboardList, LogIn, QrCode, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { PublicSite } from "@/lib/public-site.functions";

const SYSTEM_LABEL: Record<string, string> = {
  board: "Board (BISE)",
  cambridge: "Cambridge",
  both: "Board (BISE) & Cambridge",
};

/** Public home page shown on an institution's own web address. */
export function SchoolHome({ site }: { site: PublicSite }) {
  const system = site.academicSystem ? SYSTEM_LABEL[site.academicSystem] : null;
  const cards = [
    { icon: ClipboardList, title: "Apply for admission", body: "Send an admission inquiry and our office will contact you.", to: "/inquire" as const, cta: "Start inquiry" },
    { icon: LogIn, title: "Parent & student portal", body: "Homework, attendance, results, fee vouchers and notices in one place.", to: "/auth" as const, cta: "Sign in" },
    { icon: QrCode, title: "Verify a fee voucher", body: "Scan the QR code printed on any fee voucher to see its live payment status.", to: "/auth" as const, cta: "Staff sign in" },
  ];
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            {site.logoUrl ? (
              <img src={site.logoUrl} alt={`${site.name} logo`} className="h-10 w-10 rounded object-contain" />
            ) : (
              <GraduationCap className="h-8 w-8 text-primary" />
            )}
            <span className="font-serif text-lg font-semibold">{site.name}</span>
          </div>
          <Button asChild><Link to="/auth">Sign in</Link></Button>
        </div>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-6 py-20 text-center">
          {system && <p className="text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground">{system}</p>}
          <h1 className="mt-4 font-serif text-4xl font-semibold tracking-tight sm:text-6xl">Welcome to {site.name}</h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
            Admissions, fees, results and daily updates for parents and students — all in one place.
          </p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Button size="lg" asChild><Link to="/inquire">Apply for admission</Link></Button>
            <Button size="lg" variant="outline" asChild><Link to="/auth">Parent / student sign in</Link></Button>
          </div>
        </section>

        <section className="mx-auto grid max-w-6xl gap-5 px-6 pb-20 md:grid-cols-3">
          {cards.map((c) => (
            <div key={c.title} className="rounded-lg border border-border bg-card p-6">
              <c.icon className="h-6 w-6 text-primary" />
              <h2 className="mt-4 font-serif text-xl font-semibold">{c.title}</h2>
              <p className="mt-2 text-sm text-muted-foreground">{c.body}</p>
              <Button variant="link" className="mt-3 px-0" asChild><Link to={c.to}>{c.cta} →</Link></Button>
            </div>
          ))}
        </section>

        <section className="border-t border-border bg-muted/40">
          <div className="mx-auto max-w-3xl px-6 py-14 text-center">
            <MapPin className="mx-auto h-5 w-5 text-muted-foreground" />
            <h2 className="mt-3 font-serif text-2xl font-semibold">First time signing in?</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Create an account with your email, tick "I am a student or parent", then enter the student code and the
              guardian phone number registered with the school. Your account links to your child automatically.
            </p>
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-6 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} {site.name}
      </footer>
    </div>
  );
}
