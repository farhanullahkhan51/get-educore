import { X } from "lucide-react";
import { MODULE_LAYOUTS } from "@/lib/ui-layout";
import { useModuleLayout } from "@/lib/ui-prefs";
import { Button } from "@/components/ui/button";

export function filterLabel(module: string, value: string): string {
  return MODULE_LAYOUTS[module]?.filter.find((o) => o.value === value)?.label ?? value;
}

/** Visible reminder that a saved view filter is hiding records, with one click to clear it. */
export function ActiveFilterChip({ module }: { module: string }) {
  const { layout, setLayout } = useModuleLayout(module);
  if (layout.filter === "all") return null;
  return (
    <button
      type="button"
      onClick={() => void setLayout({ filter: "all" })}
      className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"
      title="Clear this view filter"
    >
      Showing: {filterLabel(module, layout.filter)}
      <X className="h-3 w-3" />
    </button>
  );
}

/** Message shown when a view filter has hidden every record. */
export function FilteredEmptyState({ module, noun }: { module: string; noun: string }) {
  const { layout, setLayout } = useModuleLayout(module);
  return (
    <div className="space-y-2 py-2">
      <p>No {noun} match the current view ({filterLabel(module, layout.filter)}).</p>
      <Button size="sm" variant="outline" onClick={() => void setLayout({ filter: "all" })}>
        Show all {noun}
      </Button>
    </div>
  );
}
