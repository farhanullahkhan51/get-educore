import { Link } from "@tanstack/react-router";
import type { LinkProps } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Table = "campuses" | "fee_structures" | "sections" | "staff" | "students";
const STEPS: Array<{ table: Table; label: string; to: LinkProps["to"] }> = [
  { table: "campuses", label: "Campus profile", to: "/campuses" },
  { table: "fee_structures", label: "Fee structure", to: "/fees" },
  { table: "sections", label: "Classes & sections", to: "/classes" },
  { table: "staff", label: "Staff added", to: "/staff" },
  { table: "students", label: "Students enrolled", to: "/students" },
];

/** Duolingo-style readiness tracker for super admins. Hides itself once everything is set up. */
export function SetupMilestones() {
  const { data } = useQuery({
    queryKey: ["setup-milestones"],
    queryFn: async () => {
      const res = await Promise.all(
        STEPS.map((s) => supabase.from(s.table).select("id", { count: "exact", head: true })),
      );
      return res.map((r) => (r.count ?? 0) > 0);
    },
    staleTime: 60_000,
  });
  if (!data) return null;
  const done = data.filter(Boolean).length;
  if (done === STEPS.length) return null;
  const pct = Math.round((done / STEPS.length) * 100);
  return (
    <div className="glass-panel dash-rise mb-6 rounded-2xl p-5">
      <div className="flex items-baseline justify-between">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Institution readiness</div>
          <div className="mt-1 font-serif text-xl">{done} of {STEPS.length} milestones complete</div>
        </div>
        <div className="font-serif text-3xl tabular-nums">{pct}%</div>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out" style={{ width: `${pct}%` }} />
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {STEPS.map((s, i) => (
          <Link key={s.table} to={s.to} className={"press flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm " + (data[i] ? "border-primary/40 bg-primary/10" : "border-border hover:bg-accent")}>
            <span className={"flex h-4 w-4 items-center justify-center rounded-full " + (data[i] ? "bg-primary text-primary-foreground" : "border border-muted-foreground/40")}>
              {data[i] ? <Check className="h-3 w-3" /> : null}
            </span>
            {s.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
