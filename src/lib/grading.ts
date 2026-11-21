// Track-specific grading. BISE uses Pakistani board divisions; Cambridge uses A*–U letters.
export type GradingTrack = "board" | "cambridge";

const BOARD: [number, string][] = [[80, "A+"], [70, "A"], [60, "B"], [50, "C"], [40, "D"], [33, "E"]];
const CAMBRIDGE: [number, string][] = [[90, "A*"], [80, "A"], [70, "B"], [60, "C"], [50, "D"], [40, "E"]];

export function gradeForTrack(percent: number | null | undefined, track: GradingTrack): string | null {
  if (percent == null || !Number.isFinite(percent)) return null;
  for (const [min, g] of track === "cambridge" ? CAMBRIDGE : BOARD) if (percent >= min) return g;
  return track === "cambridge" ? "U" : "F";
}

export function trackOf(system: string | null | undefined): GradingTrack {
  return system === "cambridge" ? "cambridge" : "board";
}
