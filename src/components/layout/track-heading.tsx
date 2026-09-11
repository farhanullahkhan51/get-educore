/**
 * Shared Board / Cambridge group styling.
 * Board headings read blue, Cambridge headings read orange, anything else stays neutral.
 */
export function trackOf(label: string): "board" | "cambridge" | "other" {
  const l = label.toLowerCase();
  if (l.includes("cambridge")) return l.includes("board") ? "other" : "cambridge";
  if (l.includes("board")) return "board";
  return "other";
}

export const trackRowCls = (label: string) =>
  ({
    board: "bg-blue-50 hover:bg-blue-50 dark:bg-blue-950/40 dark:hover:bg-blue-950/40",
    cambridge: "bg-orange-50 hover:bg-orange-50 dark:bg-orange-950/40 dark:hover:bg-orange-950/40",
    other: "bg-muted/50 hover:bg-muted/50",
  })[trackOf(label)];

export const trackChipCls = (label: string) =>
  ({
    board: "border-blue-500 bg-blue-50 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200",
    cambridge: "border-orange-500 bg-orange-50 text-orange-800 dark:bg-orange-950/40 dark:text-orange-200",
    other: "border-border bg-muted text-muted-foreground",
  })[trackOf(label)];

export const trackTextCls = (label: string) =>
  ({
    board: "text-blue-800 dark:text-blue-200",
    cambridge: "text-orange-800 dark:text-orange-200",
    other: "text-muted-foreground",
  })[trackOf(label)];
