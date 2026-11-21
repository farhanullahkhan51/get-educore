import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { LinkProps } from "@tanstack/react-router";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";

export type PaletteItem = { to: string; label: string; icon: React.ComponentType<{ className?: string }> };

/** "/" quick jump to any module the user can open. */
export function CommandPalette({ items }: { items: PaletteItem[] }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      e.preventDefault();
      setOpen((o) => !o);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="press hidden items-center gap-2 rounded-full border bg-background/60 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur hover:text-foreground md:flex">
        Search modules <kbd className="rounded border px-1.5 font-mono text-[10px]">/</kbd>
      </button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Jump to a module…" />
        <CommandList>
          <CommandEmpty>No module found.</CommandEmpty>
          <CommandGroup heading="Modules">
            {items.map((i) => {
              const Icon = i.icon;
              return (
                <CommandItem key={String(i.to)} value={i.label} onSelect={() => { setOpen(false); navigate({ to: i.to as LinkProps["to"] }); }}>
                  <Icon className="mr-2 h-4 w-4" />{i.label}
                </CommandItem>
              );
            })}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
