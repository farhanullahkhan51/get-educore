import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

export type UsageKind = "students" | "staff" | "campuses";

export type PlanUsageRow = {
  students_used: number;
  students_cap: number | null;
  staff_used: number;
  staff_cap: number | null;
  campuses_used: number;
  campuses_cap: number | null;
};

/**
 * Exact stored counts for the signed-in user's institution, straight from the
 * database — never derived from whatever rows a page happened to load.
 */
export function usePlanUsage() {
  return useQuery({
    queryKey: ["plan-usage"],
    staleTime: 30_000,
    queryFn: async (): Promise<PlanUsageRow | null> => {
      const { data, error } = await supabase.rpc("my_plan_usage");
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return (row as PlanUsageRow | undefined) ?? null;
    },
  });
}

export type LimitStatus = {
  used: number;
  cap: number | null;
  reached: boolean;
  isLoading: boolean;
};

export function useLimitStatus(kind: UsageKind): LimitStatus {
  const { data, isLoading } = usePlanUsage();
  const used = data ? data[`${kind}_used`] : 0;
  const cap = data ? data[`${kind}_cap`] : null;
  return {
    used,
    cap: typeof cap === "number" ? cap : null,
    reached: typeof cap === "number" && used >= cap,
    isLoading,
  };
}

/** Small inline note shown beside a disabled "New …" button. */
export function LimitNotice({ cap, label }: { cap: number; label: string }) {
  return (
    <span className="text-xs text-muted-foreground">
      Plan limit reached ({cap} {label}).{" "}
      <Link to="/billing" className="underline underline-offset-2 hover:text-foreground">
        Upgrade plan
      </Link>
    </span>
  );
}
