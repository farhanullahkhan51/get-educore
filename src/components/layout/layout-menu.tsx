import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuCheckboxItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SlidersHorizontal, RotateCcw, Building2 } from "lucide-react";
import { toast } from "sonner";
import { MODULE_LAYOUTS, isCustomised } from "@/lib/ui-layout";
import { useModuleLayout } from "@/lib/ui-prefs";

/**
 * Header control showing the module's active layout, with a one-click reset.
 * The AI assistant writes to the same preferences this menu edits.
 */
export function LayoutMenu({ module }: { module: string }) {
  const spec = MODULE_LAYOUTS[module];
  const { layout, setLayout, resetLayout, hasPersonal, hasInstitution, canSetTenantDefault, saving } =
    useModuleLayout(module);
  if (!spec) return null;

  const custom = isCustomised(module, layout);

  const apply = (patch: Parameters<typeof setLayout>[0]) =>
    setLayout(patch).catch((e: Error) => toast.error(e.message));

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={saving}>
          <SlidersHorizontal className="mr-1 h-3.5 w-3.5" />
          Layout{custom ? " ·" : ""}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel>Group by</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={layout.groupBy} onValueChange={(v) => apply({ groupBy: v })}>
          {spec.groupBy.map((o) => (
            <DropdownMenuRadioItem key={o.value} value={o.value}>{o.label}</DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />
        <DropdownMenuLabel>Show</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={layout.filter} onValueChange={(v) => apply({ filter: v })}>
          {spec.filter.map((o) => (
            <DropdownMenuRadioItem key={o.value} value={o.value}>{o.label}</DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />
        <DropdownMenuLabel>Sort by</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={layout.sortBy} onValueChange={(v) => apply({ sortBy: v })}>
          {spec.sortBy.map((o) => (
            <DropdownMenuRadioItem key={o.value} value={o.value}>{o.label}</DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>

        {spec.columns.length > 0 && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Columns</DropdownMenuLabel>
            {spec.columns.map((c) => (
              <DropdownMenuCheckboxItem
                key={c.value}
                checked={!layout.hidden.includes(c.value)}
                onCheckedChange={(on) =>
                  apply({
                    hidden: on ? layout.hidden.filter((h) => h !== c.value) : [...layout.hidden, c.value],
                  })
                }
              >
                {c.label}
              </DropdownMenuCheckboxItem>
            ))}
          </>
        )}

        <DropdownMenuSeparator />
        <DropdownMenuLabel>Density</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={layout.density}
          onValueChange={(v) => apply({ density: v as "compact" | "comfortable" })}
        >
          <DropdownMenuRadioItem value="comfortable">Comfortable</DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="compact">Compact</DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>

        <DropdownMenuSeparator />
        {canSetTenantDefault && (
          <DropdownMenuItem
            onSelect={() =>
              setLayout(layout, "institution")
                .then(() => toast.success("Saved as the default for everyone"))
                .catch((e: Error) => toast.error(e.message))
            }
          >
            <Building2 className="mr-2 h-4 w-4" /> Set as institution default
          </DropdownMenuItem>
        )}
        <DropdownMenuItem
          disabled={!hasPersonal}
          onSelect={() => resetLayout("personal").then(() => toast.success("Layout reset"))}
        >
          <RotateCcw className="mr-2 h-4 w-4" /> Reset my layout
        </DropdownMenuItem>
        {canSetTenantDefault && hasInstitution && (
          <DropdownMenuItem onSelect={() => resetLayout("institution").then(() => toast.success("Institution default cleared"))}>
            <RotateCcw className="mr-2 h-4 w-4" /> Clear institution default
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
