import { useMemo } from "react";
import { useTenant } from "@/lib/tenant-context";
import type { ModuleLayout } from "@/lib/ui-layout";

/**
 * Board / Cambridge separation is on by default, but only means something for
 * institutions that actually run both systems. Single-system institutions get a
 * flat list instead of a single pointless heading.
 */
export function useTrackLayout(layout: ModuleLayout): ModuleLayout {
  const system = useTenant().tenant?.academic_system ?? "both";
  return useMemo(
    () => (layout.groupBy === "track" && system !== "both" ? { ...layout, groupBy: "none" } : layout),
    [layout, system],
  );
}
