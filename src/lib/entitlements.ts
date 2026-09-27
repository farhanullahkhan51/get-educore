import { useMemo } from "react";
import { useTenant } from "@/lib/tenant-context";

/** Every gateable capability, in the order they appear in the plan editor. */
export const FEATURES = [
  { key: "admissions", label: "Admissions" },
  { key: "admissions_pipeline", label: "Admissions pipeline (Kanban + conversion)" },
  { key: "fees", label: "Fees & challans" },
  { key: "bank_reconciliation", label: "Bank reconciliation" },
  { key: "payroll", label: "Staff payroll" },
  { key: "academics", label: "Academics & gradebook" },
  { key: "board", label: "BISE Board module" },
  { key: "cambridge", label: "Cambridge module" },
  { key: "track_switch", label: "Track switch (Board ↔ Cambridge)" },
  { key: "timetable", label: "Timetable & scheduling" },
  { key: "certificates", label: "Certificates & documents" },
  { key: "certificates_all_templates", label: "All certificate templates" },
  { key: "notices", label: "Notice board & circulars" },
  { key: "portal", label: "Student portal" },
  { key: "insights", label: "Principal insights & analytics" },
  { key: "ai_assistant", label: "AI assistant" },
  { key: "branding_full", label: "Full branding (colours, fonts, letterhead)" },
  { key: "custom_domain", label: "Custom domain" },
  { key: "edit_mode", label: "Layout edit mode" },
] as const;

export type FeatureKey = (typeof FEATURES)[number]["key"];
export type LimitKey = "student_limit" | "campus_limit" | "staff_limit" | "ai_message_limit";

export type Entitlements = {
  /** Board / Cambridge / Both — chosen for the institution when the plan is bought. */
  academicSystem: "board" | "cambridge" | "both";
  hasBoard: boolean;
  hasCambridge: boolean;
  planName: string | null;
  /** True when the plan allows the feature. No plan attached = everything allowed. */
  can: (feature: FeatureKey) => boolean;
  /** null means unlimited. */
  limit: (key: LimitKey) => number | null;
  isLoading: boolean;
};

export function useEntitlements(): Entitlements {
  const { tenant, isLoading } = useTenant();

  return useMemo(() => {
    const system = tenant?.academic_system ?? "both";
    const flags = tenant?.feature_flags ?? null;
    const hasPlan = !!tenant?.plan_name;

    return {
      academicSystem: system,
      hasBoard: system !== "cambridge",
      hasCambridge: system !== "board",
      planName: tenant?.plan_name ?? null,
      can: (feature: FeatureKey) => {
        // Examination-system entitlement always wins over the plan flag.
        if (feature === "board" && system === "cambridge") return false;
        if (feature === "cambridge" && system === "board") return false;
        if (feature === "track_switch" && system !== "both") return false;
        if (!hasPlan || !flags) return true;
        return flags[feature] !== false;
      },
      limit: (key: LimitKey) => {
        if (!tenant) return null;
        const value = tenant[key];
        return typeof value === "number" ? value : null;
      },
      isLoading,
    };
  }, [tenant, isLoading]);
}

/** Message shown when a limit blocks a create action. */
export function limitMessage(what: string, cap: number, planName: string | null) {
  return `Your ${planName ?? "current"} plan allows up to ${cap} ${what}. Upgrade to add more.`;
}
