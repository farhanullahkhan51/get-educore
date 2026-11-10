import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { GraduationCap, Armchair, CalendarClock, Landmark, Languages, Check, ArrowRight, Globe } from "lucide-react";
import { useTenant } from "@/lib/tenant-context";
import { getPublicSite } from "@/lib/public-site.functions";

export const Route = createFileRoute("/")({
  beforeLoad: async () => {
    if (typeof window === "undefined") return;
    const { data } = await supabase.auth.getSession();
    if (data.session) throw redirect({ to: "/dashboard" });
  },
  loader: () => getPublicSite(),
  head: ({ loaderData }) => {
    const site = loaderData ?? { name: "EduCore", origin: "https://get-educore.lovable.app" };
    const title = `${site.name} — Academic ERP for admissions, fees and results`;
    const description = `${site.name} unifies admissions, fees, attendance, results and certificates across every campus, with Board (BISE) and Cambridge support.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: `${site.origin}/` },
        { name: "twitter:card", content: "summary" },
      ],
      links: [{ rel: "canonical", href: `${site.origin}/` }],
    };
  },
  component: Landing,
});

const STEPS = [
  { icon: Armchair, kicker: "01 · Classes & Seating", title: "Every chair, every child, accounted for.", body: "Drag-and-drop 3D seating that respects section capacity. Full sections refuse new admissions and suggest a new section instead." },
  { icon: CalendarClock, kicker: "02 · Timetable & Proxy", title: "Clash-free timetables, covered absences.", body: "The optimiser catches teacher and room clashes, then allocates fair, subject-matched proxy teachers the moment someone is on leave." },
  { icon: Landmark, kicker: "03 · Fees & Bank Reconciliation", title: "Bank deposits that settle themselves.", body: "Import HBL, Meezan, UBL or MCB statements and payments match challans automatically — partials, overpayments and duplicates handled." },
  { icon: Languages, kicker: "04 · Bilingual Circulars", title: "One notice. English and اردو.", body: "Compose a circular once and publish it in both languages to the notice board, student portal and parents." },
];

function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && setSeen(true), { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return { ref, cls: `transition-all duration-700 ${seen ? "opacity-100 translate-y-0" : "opacity-0 translate-y-8"}` };
}

function Reveal({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  const r = useReveal();
  return <div ref={r.ref} className={`${r.cls} ${className}`}>{children}</div>;
}

function Screen({ step }: { step: number }) {
  return (
    <div className="relative h-full w-full overflow-hidden bg-ivory">
      <div className="flex items-center gap-1.5 border-b border-border bg-background px-3 py-2">
        <span className="h-2 w-2 rounded-full bg-destructive/60" />
        <span className="h-2 w-2 rounded-full bg-gold/70" />
        <span className="h-2 w-2 rounded-full bg-primary/40" />
        <span className="ml-3 text-[10px] text-muted-foreground">{STEPS[step].kicker}</span>
      </div>
      {STEPS.map((_, i) => (
        <div key={i} className={`absolute inset-x-0 bottom-0 top-8 p-4 transition-all duration-700 ${i === step ? "opacity-100 scale-100" : "pointer-events-none opacity-0 scale-95"}`}>
          {i === 0 && (
            <div>
              <div className="mb-2 flex justify-between text-[10px] text-muted-foreground"><span>Grade 9 · Section A</span><span>28 / 30 seated</span></div>
              <div className="grid grid-cols-6 gap-1.5">
                {Array.from({ length: 30 }).map((_, k) => (
                  <div key={k} className={`h-6 rounded-sm ${k < 28 ? "bg-primary/80" : "border border-dashed border-gold"}`} style={{ transitionDelay: `${k * 20}ms` }} />
                ))}
              </div>
              <div className="mt-2 h-1.5 rounded bg-gold/60" />
            </div>
          )}
          {i === 1 && (
            <div className="grid grid-cols-5 gap-1 text-[9px]">
              {["Mon", "Tue", "Wed", "Thu", "Fri"].map((d) => <div key={d} className="text-center font-semibold text-muted-foreground">{d}</div>)}
              {Array.from({ length: 25 }).map((_, k) => (
                <div key={k} className={`rounded-sm p-1 text-center ${k === 7 ? "bg-gold text-gold-foreground" : k % 4 === 0 ? "bg-muted" : "bg-primary/15 text-primary"}`}>
                  {k === 7 ? "Proxy ✓" : ["Math", "Eng", "Phy", "Urdu", "Chem"][k % 5]}
                </div>
              ))}
              <div className="col-span-5 mt-1 rounded-sm bg-primary text-center text-primary-foreground">No clashes found</div>
            </div>
          )}
          {i === 2 && (
            <div className="space-y-1.5 text-[10px]">
              {[["CH-1042", "PKR 12,000", "Settled"], ["CH-1043", "PKR 6,000", "Partial"], ["CH-1044", "PKR 12,500", "Review"], ["CH-1045", "PKR 12,000", "Settled"]].map(([c, a, st]) => (
                <div key={c} className="flex items-center justify-between rounded-sm border border-border bg-background px-2 py-1.5">
                  <span className="font-mono">{c}</span><span>{a}</span>
                  <span className={`rounded px-1.5 ${st === "Settled" ? "bg-primary text-primary-foreground" : "bg-gold/30"}`}>{st}</span>
                </div>
              ))}
              <div className="pt-1 text-right font-serif text-sm text-primary">Collected today · PKR 30,000</div>
            </div>
          )}
          {i === 3 && (
            <div className="rounded-sm border border-gold/50 bg-background p-3 text-[10px]">
              <p className="font-serif text-sm">Winter Vacation Notice</p>
              <p className="mt-1 text-muted-foreground">School will remain closed from 22 December to 2 January.</p>
              <div className="my-2 h-px bg-gold/50" />
              <p dir="rtl" className="font-serif text-sm">موسم سرما کی تعطیلات</p>
              <p dir="rtl" className="mt-1 text-muted-foreground">اسکول 22 دسمبر سے 2 جنوری تک بند رہے گا۔</p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function LaptopTour() {
  const [step, setStep] = useState(0);
  const [tilt, setTilt] = useState(14);
  const refs = useRef<(HTMLDivElement | null)[]>([]);
  const wrap = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && setStep(Number((e.target as HTMLElement).dataset.i))),
      { rootMargin: "-45% 0px -45% 0px" },
    );
    refs.current.forEach((r) => r && io.observe(r));
    const onScroll = () => {
      const el = wrap.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - window.innerHeight)));
      setTilt(14 - p * 14);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => { io.disconnect(); window.removeEventListener("scroll", onScroll); };
  }, []);
  return (
    <section ref={wrap} className="relative mx-auto max-w-6xl px-6">
      <div className="grid gap-10 md:grid-cols-2">
        <div>
          {STEPS.map((s, i) => (
            <div key={i} data-i={i} ref={(el) => { refs.current[i] = el; }} className="flex min-h-[70vh] flex-col justify-center md:min-h-screen">
              <div className={`transition-opacity duration-500 ${step === i ? "opacity-100" : "md:opacity-30"}`}>
                <s.icon className="h-6 w-6 text-gold" />
                <p className="mt-4 text-xs uppercase tracking-[0.25em] text-gold">{s.kicker}</p>
                <h3 className="mt-3 font-serif text-3xl font-semibold leading-tight md:text-4xl">{s.title}</h3>
                <p className="mt-4 max-w-md text-muted-foreground">{s.body}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="sticky top-0 hidden h-screen items-center md:flex" style={{ perspective: "1600px" }}>
          <div className="w-full transition-transform duration-300 ease-out" style={{ transform: `rotateX(${tilt}deg) rotateY(${-tilt / 2}deg)`, transformStyle: "preserve-3d" }}>
            <div className="rounded-t-xl border-[10px] border-oxford bg-oxford shadow-2xl">
              <div className="aspect-[16/10]"><Screen step={step} /></div>
            </div>
            <div className="mx-[-6%] h-3 rounded-b-xl bg-gradient-to-b from-muted-foreground/40 to-muted-foreground/20" />
            <div className="mx-auto mt-6 flex justify-center gap-2">
              {STEPS.map((_, i) => <span key={i} className={`h-1 rounded-full transition-all ${i === step ? "w-8 bg-gold" : "w-3 bg-border"}`} />)}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function TrackToggle() {
  const [t, setT] = useState<"board" | "cambridge">("board");
  const data = t === "board"
    ? { name: "BISE Board", levels: "Matric · FSc · ICS · I.Com", grading: "A1 · A · B · C · D — percentage based", subjects: ["Physics", "Chemistry", "Biology", "Mathematics", "Urdu", "Islamiat"] }
    : { name: "Cambridge", levels: "O Level · AS · A Level", grading: "A* · A · B · C · D · E — grade boundaries", subjects: ["Physics", "Chemistry", "Biology", "Add. Maths", "English Language", "Pakistan Studies"] };
  return (
    <div className="mx-auto max-w-3xl rounded-2xl border border-gold/40 bg-background p-8 shadow-sm">
      <div className="mx-auto flex w-fit rounded-full border border-border p-1">
        {(["board", "cambridge"] as const).map((k) => (
          <button key={k} onClick={() => setT(k)} className={`rounded-full px-5 py-2 text-sm transition-colors ${t === k ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>
            {k === "board" ? "BISE Board" : "Cambridge"}
          </button>
        ))}
      </div>
      <div key={t} className="mt-8 grid gap-6 animate-in fade-in slide-in-from-bottom-2 duration-500 md:grid-cols-2">
        <div>
          <h4 className="font-serif text-2xl font-semibold">{data.name}</h4>
          <p className="mt-2 text-sm text-muted-foreground">{data.levels}</p>
          <p className="mt-4 text-sm"><span className="text-gold">Grading:</span> {data.grading}</p>
        </div>
        <div className="flex flex-wrap content-start gap-2">
          {data.subjects.map((s) => <span key={s} className="rounded-full border border-border px-3 py-1 text-xs">{s}</span>)}
        </div>
      </div>
    </div>
  );
}

const TIERS = [
  { name: "Starter", blurb: "For a single growing school.", items: ["Admissions, fees & students", "Attendance & results", "Notice board & homework", "Student portal"] },
  { name: "Pro", blurb: "For established institutions.", featured: true, items: ["Everything in Starter", "Timetable optimiser & proxies", "Bank reconciliation", "Expenses & staff HR"] },
  { name: "Enterprise", blurb: "For multi-campus groups.", items: ["Everything in Pro", "Unlimited campuses", "Custom domain & white-label", "AI assistant & integrations"] },
];

function Landing() {
  const { tenant } = useTenant();
  const brandName = tenant?.name ?? "EduCore";
  return (
    <div className="min-h-screen bg-ivory text-foreground">
      <header className="sticky top-0 z-40 border-b border-gold/30 bg-ivory/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-2">
            {tenant?.logo_url ? (
              <img src={tenant.logo_url} alt={`${brandName} logo`} className="h-8 w-8 rounded-sm object-contain" />
            ) : (
              <div className="grid h-8 w-8 place-items-center rounded-sm bg-oxford text-gold"><GraduationCap className="h-4 w-4" /></div>
            )}
            <span className="font-serif text-lg font-semibold tracking-tight">{brandName}</span>
          </div>
          <div className="flex items-center gap-2">
            <Link to="/inquire" className="hidden sm:block"><Button variant="ghost" size="sm">Apply / Inquire</Button></Link>
            <Link to="/auth"><Button size="sm" className="bg-oxford text-oxford-foreground hover:bg-oxford/90">Sign in</Button></Link>
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute -top-40 left-1/2 h-[500px] w-[900px] -translate-x-1/2 rounded-full bg-gold/15 blur-3xl" />
          <div className="relative mx-auto max-w-5xl px-6 pb-24 pt-24 text-center md:pt-32">
            <Reveal>
              <p className="text-xs uppercase tracking-[0.3em] text-gold">School & College Management ERP</p>
              <h1 className="mx-auto mt-6 max-w-4xl font-serif text-5xl font-semibold leading-[1.02] tracking-tight md:text-7xl">
                The operating system for <em className="text-gold">distinguished</em> institutions.
              </h1>
              <p className="mx-auto mt-8 max-w-2xl text-lg text-muted-foreground">
                {brandName} brings admissions, fees, timetables, seating, results and parent communication into one quiet, reliable system — for BISE Board and Cambridge alike.
              </p>
              <div className="mt-10 flex flex-wrap justify-center gap-3">
                <Link to="/auth"><Button size="lg" className="bg-oxford text-oxford-foreground hover:bg-oxford/90">Start your 20-day trial <ArrowRight className="ml-1 h-4 w-4" /></Button></Link>
                <Link to="/inquire"><Button size="lg" variant="outline" className="border-gold/60">Register an inquiry</Button></Link>
              </div>
              <div className="mt-10 flex flex-wrap justify-center gap-6 text-xs text-muted-foreground">
                {["BISE & Cambridge", "Multi-campus", "Urdu + English", "Bank-reconciled fees"].map((c) => (
                  <span key={c} className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-gold" />{c}</span>
                ))}
              </div>
            </Reveal>
          </div>
        </section>

        <div className="mx-auto max-w-6xl px-6"><div className="h-px bg-gradient-to-r from-transparent via-gold/60 to-transparent" /></div>

        <LaptopTour />

        <section className="bg-background py-28">
          <Reveal className="px-6">
            <p className="text-center text-xs uppercase tracking-[0.3em] text-gold">Two curricula · One system</p>
            <h2 className="mx-auto mt-4 max-w-2xl text-center font-serif text-4xl font-semibold">Switch tracks without switching software.</h2>
            <div className="mt-12"><TrackToggle /></div>
          </Reveal>
        </section>

        <section className="bg-oxford py-28 text-oxford-foreground">
          <Reveal className="mx-auto grid max-w-6xl gap-12 px-6 md:grid-cols-2 md:items-center">
            <div>
              <Globe className="h-6 w-6 text-gold" />
              <h2 className="mt-4 font-serif text-4xl font-semibold leading-tight">Your crest. Your domain. Your colours.</h2>
              <p className="mt-4 opacity-75">Parents and students see your institution — on your own web address, with your logo, fonts and colours. Nothing else.</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[["98%", "fee recovery tracked"], ["0", "timetable clashes"], ["2", "languages per notice"], ["24/7", "student portal"]].map(([n, l]) => (
                <div key={l} className="rounded-xl border border-gold/30 p-6">
                  <div className="font-serif text-4xl text-gold">{n}</div>
                  <div className="mt-1 text-sm opacity-70">{l}</div>
                </div>
              ))}
            </div>
          </Reveal>
        </section>

        <section className="py-28">
          <Reveal className="mx-auto max-w-6xl px-6">
            <h2 className="text-center font-serif text-4xl font-semibold">Three plans. Every core module included.</h2>
            <p className="mt-3 text-center text-muted-foreground">Start free for 20 days — no card required.</p>
            <div className="mt-14 grid gap-6 md:grid-cols-3">
              {TIERS.map((t) => (
                <div key={t.name} className={`rounded-2xl border p-8 ${t.featured ? "border-gold bg-oxford text-oxford-foreground shadow-xl md:-translate-y-3" : "border-border bg-background"}`}>
                  <h3 className="font-serif text-2xl font-semibold">{t.name}</h3>
                  <p className={`mt-1 text-sm ${t.featured ? "opacity-70" : "text-muted-foreground"}`}>{t.blurb}</p>
                  <ul className="mt-6 space-y-3 text-sm">
                    {t.items.map((i) => <li key={i} className="flex gap-2"><Check className="h-4 w-4 shrink-0 text-gold" />{i}</li>)}
                  </ul>
                  <Link to="/auth"><Button className={`mt-8 w-full ${t.featured ? "bg-gold text-gold-foreground hover:bg-gold/90" : ""}`} variant={t.featured ? "default" : "outline"}>Start trial</Button></Link>
                </div>
              ))}
            </div>
          </Reveal>
        </section>
      </main>

      <footer className="border-t border-gold/30">
        <div className="mx-auto flex max-w-6xl justify-between px-6 py-8 text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} {brandName}. Built for institutions.</span>
          <span className="font-serif italic">Records kept. People remembered.</span>
        </div>
      </footer>
    </div>
  );
}
