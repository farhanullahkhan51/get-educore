import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { LinkProps } from "@tanstack/react-router";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Search, ArrowLeft, ArrowUpRight, FileText, Loader2 } from "lucide-react";
import { accessibleSources, recordTitle, searchWords, slashShouldToggle, type SearchRecord } from "@/lib/system-search";
import { searchSystem } from "@/lib/system-search-client";

export type PaletteItem = { to: string; label: string; icon: React.ComponentType<{ className?: string }> };

/** One palette shared by mobile and desktop; search respects the caller's existing access. */
export function CommandPalette({ items }: { items: PaletteItem[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [records, setRecords] = useState<SearchRecord[]>([]);
  const [selected, setSelected] = useState<SearchRecord | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState<string[]>([]);
  const [more, setMore] = useState(false);
  const [limit, setLimit] = useState(6);
  const paths = items.map((item) => item.to).join("|");
  const sources = useMemo(() => accessibleSources(paths.split("|")), [paths]);
  const navigate = useNavigate();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const editable = Boolean(t?.closest("input, textarea, select, [contenteditable=true], [role=textbox]"));
      if (!slashShouldToggle(e, open, editable, Boolean(t?.closest("[data-system-search-input]")))) return;
      e.preventDefault();
      e.stopPropagation();
      setOpen((o) => !o);
    };
    // Capture precedes the dialog's focus trap and command input key handlers.
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);
  useEffect(() => {
    if (!open) { setQuery(""); setSelected(null); setRecords([]); setLimit(6); return; }
    const controller = new AbortController();
    setRecords([]); setFailed([]); setMore(false);
    if (searchWords(query).join("").length < 2) { setLoading(false); return; }
    setLoading(true);
    const timer = window.setTimeout(() => {
      searchSystem(sources, query, limit, controller.signal).then((result) => {
        if (controller.signal.aborted) return;
        setRecords(result.records); setFailed(result.failed); setMore(result.more); setLoading(false);
      }).catch(() => {
        if (!controller.signal.aborted) { setFailed(["Search unavailable. Please try again."]); setLoading(false); }
      });
    }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [open, query, sources, limit]);
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const modules = items.filter((item) => words.every((word) => item.label.toLowerCase().includes(word)));
  const go = (to: string) => { setOpen(false); navigate({ to: to as LinkProps["to"] }); };
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)} aria-label="Search system" className="press gap-2 text-muted-foreground">
        <Search className="h-4 w-4" /><span className="hidden md:inline">Search system</span><kbd className="hidden rounded border px-1.5 font-mono text-[10px] md:inline">/</kbd>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl overflow-hidden p-0">
          <DialogTitle className="sr-only">Search EduCore</DialogTitle>
          <DialogDescription className="sr-only">Search accessible pages and system records.</DialogDescription>
          {selected ? (
            <div className="p-5">
              <Button variant="ghost" size="sm" onClick={() => setSelected(null)}><ArrowLeft className="mr-2 h-4 w-4" />Back to results</Button>
              <p className="mt-4 text-xs text-muted-foreground">{selected.source.label}</p>
              <h2 className="mt-1 break-words pr-6 text-lg font-semibold">{recordTitle(selected)}</h2>
              <dl className="mt-4 grid max-h-[50vh] grid-cols-1 gap-3 overflow-auto sm:grid-cols-2">
                {Object.entries(selected.fields).filter(([key, value]) => key !== "id" && value !== null && value !== "").map(([key, value]) => (
                  <div key={key} className="min-w-0"><dt className="text-xs capitalize text-muted-foreground">{key.replaceAll("_", " ")}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm">{String(value)}</dd></div>
                ))}
              </dl>
              <Button className="mt-5" onClick={() => go(selected.source.to)}>Open {items.find((i) => i.to === selected.source.to)?.label ?? selected.source.label}<ArrowUpRight className="ml-2 h-4 w-4" /></Button>
            </div>
          ) : (
            <Command shouldFilter={false}>
              <CommandInput data-system-search-input value={query} onValueChange={(value) => { setQuery(value); setLimit(6); }} placeholder="Search students, staff, fees, documents…" />
              {loading && <div className="flex items-center gap-2 px-4 py-2 text-xs text-muted-foreground" role="status"><Loader2 className="h-3 w-3 animate-spin" />Searching…</div>}
              {!!failed.length && <p role="alert" className="px-4 py-2 text-xs text-destructive">Some records could not be searched: {failed.join(", ")}</p>}
              <CommandList className="max-h-[55vh]">
                {!loading && <CommandEmpty>No matching pages or records.</CommandEmpty>}
                {!!modules.length && <CommandGroup heading="Pages">{modules.map((i) => {
                  const Icon = i.icon;
                  return <CommandItem key={i.to} value={i.to} onSelect={() => go(i.to)}><Icon className="mr-2 h-4 w-4" />{i.label}</CommandItem>;
                })}</CommandGroup>}
                {sources.map((source) => {
                  const matches = records.filter((r) => r.source.table === source.table);
                  if (!matches.length) return null;
                  return <CommandGroup key={source.table} heading={source.label}>{matches.map((r) => (
                    <CommandItem key={r.id} value={`${source.table}:${r.id}`} onSelect={() => setSelected(r)}>
                      <FileText className="mr-2 h-4 w-4 shrink-0" />
                      <div className="min-w-0"><div className="truncate">{recordTitle(r)}</div><div className="truncate text-xs text-muted-foreground">{[r.fields["student_code"], r.fields["staff_code"], r.fields["student"], r.fields["staff"], r.fields["teacher"], r.fields["course"], r.fields["section"], r.fields["reference"], r.fields["status"], r.fields["guardian_name"], r.fields["subject"], r.fields["description"]].filter(Boolean).join(" · ")}</div></div>
                    </CommandItem>
                  ))}</CommandGroup>;
                })}
              </CommandList>
              {more && <Button variant="ghost" size="sm" onClick={() => setLimit((n) => n + 12)} className="m-2">Show more results</Button>}
            </Command>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
