import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type BillingState = {
  tenant_id: string;
  tenant_status: string;
  subscription_status: string | null;
  plan_name: string | null;
  billing_cycle: string | null;
  trial_ends_at: string | null;
  current_period_end: string | null;
  days_left: number | null;
  read_only: boolean;
};

/** Trial / subscription state of the signed-in user's institution. */
export function useBilling() {
  const query = useQuery({
    queryKey: ["billing.state"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("my_billing_state");
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return (row as BillingState | undefined) ?? null;
    },
    staleTime: 5 * 60 * 1000,
  });

  const state = query.data ?? null;
  const isTrial = state?.subscription_status === "trialing";
  const daysLeft = state?.days_left ?? null;

  return {
    state,
    isLoading: query.isLoading,
    isTrial,
    daysLeft,
    /** Trial expired, subscription cancelled or tenant suspended — writes blocked. */
    readOnly: state?.read_only ?? false,
    /** Day 10 of a 20-day trial onwards. */
    showUpgradeCta: isTrial && daysLeft != null && daysLeft <= 10,
  };
}

export const currency = (value: number, code = "PKR") =>
  new Intl.NumberFormat(code === "PKR" ? "en-PK" : "en-US", {
    style: "currency",
    currency: code,
    maximumFractionDigits: 0,
  }).format(value);
