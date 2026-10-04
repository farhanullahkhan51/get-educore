import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sparkles, AlertTriangle, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import {
  analyzeClashes, applyProposals, loadTimetable, optimizeSchedule, type Clash, type Proposal,
} from "@/lib/timetable-engine";

export function TimetableOptimizer({ campusId, tenantId, canEdit }: { campusId: string; tenantId: string | null; canEdit: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [clashes, setClashes] = useState<Clash[]>([]);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [unfilled, setUnfilled] = useState(0);

  async function run() {
    setOpen(true); setBusy(true);
    try {
      const d = await loadTimetable(supabase, campusId);
      setClashes(analyzeClashes(d).clashes);
      const plan = optimizeSchedule(d);
      setProposals(plan.proposals); setUnfilled(plan.unfilled_slots.length);
    } catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  }

  async function apply() {
    setBusy(true);
    try {
      const d = await loadTimetable(supabase, campusId);
      const plan = optimizeSchedule(d);
      const res = await applyProposals(supabase, d, tenantId, plan.proposals);
      toast.success(`${res.inserted} lessons scheduled${res.failed.length ? `, ${res.failed.length} skipped` : ""}.`);
      qc.invalidateQueries({ queryKey: ["timetable.entries", campusId] });
      setOpen(false);
    } catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  }

  const serious = clashes.filter((c) => c.kind !== "unscheduled");
  return (
    <>
      <Button variant="outline" onClick={run} disabled={!campusId}><Sparkles className="h-4 w-4 mr-1" />Optimise</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Timetable check & auto-fill</DialogTitle></DialogHeader>
          {busy ? <p className="text-sm text-muted-foreground">Analysing timetable…</p> : (
            <div className="space-y-5 text-sm">
              <section>
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  {serious.length ? <AlertTriangle className="h-4 w-4 text-destructive" /> : <CheckCircle2 className="h-4 w-4 text-primary" />}
                  {serious.length ? `${serious.length} issue(s) found` : "No clashes found"}
                </h3>
                <ul className="space-y-1 list-disc pl-5">
                  {clashes.slice(0, 60).map((c, i) => <li key={i} className={c.kind === "unscheduled" ? "text-muted-foreground" : ""}>{c.message}</li>)}
                </ul>
              </section>
              <section>
                <h3 className="font-semibold mb-2">Auto-fill proposal</h3>
                {proposals.length ? (
                  <>
                    <p className="text-muted-foreground mb-2">{proposals.length} empty slots can be filled clash-free from teaching assignments. Existing lessons stay untouched.{unfilled ? ` ${unfilled} slots cannot be filled without a clash.` : ""}</p>
                    <div className="border rounded-md max-h-56 overflow-y-auto divide-y">
                      {proposals.slice(0, 120).map((p, i) => (
                        <div key={i} className="px-3 py-1.5 flex justify-between gap-3"><span>{p.section} · {p.slot}</span><span className="text-muted-foreground truncate">{p.course} — {p.teacher}</span></div>
                      ))}
                    </div>
                  </>
                ) : <p className="text-muted-foreground">Nothing to fill — either all slots are taken or no teaching assignments exist for empty slots.</p>}
              </section>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>Close</Button>
            {canEdit && <Button onClick={apply} disabled={busy || !proposals.length}>Apply {proposals.length} lessons</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
