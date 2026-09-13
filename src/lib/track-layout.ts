import { useMemo } from "react";
import { useTenant } from "@/lib/tenant-context";
import type { ModuleLayout } from "@/lib/ui-layout";

/**
 * Board / Cambridge separation is on by default, but only means something for
 * institutions that actually run both systems. Single-system institutions get a
 * flat list instead of a single pointless heading.
 */
export function useTrackLayout(
  layout: ModuleLayout,
  observedSystems?: ReadonlyArray<string | null | undefined>,
): ModuleLayout {
  const system = useTenant().tenant?.academic_system ?? "both";
  const observedSystemCount = observedSystems
    ? new Set(observedSystems.filter((value) => value === "board" || value === "cambridge")).size
    : null;
  const isSingleSystem = observedSystemCount === null ? system !== "both" : observedSystemCount < 2;
  return useMemo(
    () => (layout.groupBy === "track" && isSingleSystem ? { ...layout, groupBy: "none" } : layout),
    [layout, isSingleSystem],
  );
}
