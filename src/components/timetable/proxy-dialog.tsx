import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { UserCheck, Printer } from "lucide-react";
import { toast } from "sonner";
import { applyProxies, loadProxyData, planProxies } from "@/lib/proxy-engine";
import { getActiveTenantName } from "@/lib/tenant-context";

type Plan = ReturnType<typeof planProxies>;
const today = () => new Date().toISOString().slice(0, 10);
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export function ProxyAllocator({ campusId, tenantId, canEdit, presetAbsent, presetDate, label = "Proxy" }: {
  campusId: string; tenantId: string | null; canEdit: boolean;
  presetAbsent?: string; presetDate?: string; label?: string;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [date, setDate] = useState(presetDate ?? today());
  const [teachers, setTeachers] = useState<[string, string][]>([]);
  const [absent, setAbsent] = useState(presetAbsent ?? "");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [picks, setPicks] = useState<Record<string, string>>({});

  async function openDialog() {
    setOpen(true); setPlan(null); setPicks({});
    if (presetAbsent) setAbsent(presetAbsent);
    if (presetDate) setDate(presetDate);
    const { data } = await supabase.from("staff").select("id, first_name, last_name").eq("campus_id", campusId).order("first_name");
    setTeachers((data ?? []).map((s) => [s.id, `${s.first_name} ${s.last_name}`]));
  }

  async function find() {
    if (!absent) return toast.error("Choose the absent teacher.");
    setBusy(true);
    try {
      const pd = await loadProxyData(supabase, campusId, date);
      const p = planProxies(pd, [absent]);
      setPlan(p);
      setPicks(Object.fromEntries(p.needs.filter((n) => n.recommended).map((n) => [`${n.period_id}|${n.section_id}`, n.recommended!.teacher_id])));
    } catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  }

  function print(p: Plan) {
    const rows = p.needs.map((n) => {
      const pid = picks[`${n.period_id}|${n.section_id}`];
      const proxy = n.existing_proxy ?? n.candidates.find((c) => c.teacher_id === pid)?.teacher ?? "Not covered";
      return `<tr><td>${esc(n.slot)}</td><td>${esc(n.section)}</td><td>${esc(n.course)}</td><td><b>${esc(proxy)}</b></td><td style="width:120px"></td></tr>`;
    }).join("");
    const w = window.open("", "_blank");
    if (!w) return toast.error("Allow pop-ups to print.");
    w.document.write(`<html><head><title>Proxy Slip</title><style>body{font-family:Georgia,serif;padding:32px}h1{margin:0}table{width:100%;border-collapse:collapse;margin-top:16px}td,th{border:1px solid #333;padding:8px;text-align:left;font-size:13px}</style></head><body>
<h1>${esc(getActiveTenantName())}</h1><h3>Proxy (Substitution) Slip</h3>
<p>Date: <b>${esc(p.date)} (${p.weekday})</b><br/>Absent teacher: <b>${esc(p.needs[0]?.absent_teacher ?? "")}</b></p>
<table><tr><th>Period</th><th>Class</th><th>Subject</th><th>Proxy teacher</th><th>Signature</th></tr>${rows}</table>
<p style="margin-top:48px">______________________<br/>Coordinator / Principal</p>
<script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  }

  async function save() {
    if (!plan) return;
    setBusy(true);
    try {
      const pd = await loadProxyData(supabase, campusId, date);
      const fresh = planProxies(pd, [absent]);
      const res = await applyProxies(supabase, pd, tenantId, fresh, picks);
      toast.success(`${res.saved} proxy period(s) saved.`);
      print(plan);
      setOpen(false);
    } catch (e) { toast.error((e as Error).message); }
    setBusy(false);
  }

  return (
    <>
      <Button variant="outline" onClick={openDialog} disabled={!campusId}><UserCheck className="h-4 w-4 mr-1" />Proxy</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Proxy teacher allocation</DialogTitle></DialogHeader>
          <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto] items-end text-sm">
            <div>
              <label className="text-xs text-muted-foreground">Absent teacher</label>
              <Select value={absent} onValueChange={(v) => { setAbsent(v); setPlan(null); }}>
                <SelectTrigger><SelectValue placeholder="Choose teacher" /></SelectTrigger>
                <SelectContent>{teachers.map(([id, n]) => <SelectItem key={id} value={id}>{n}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Date</label>
              <Input type="date" value={date} onChange={(e) => { setDate(e.target.value); setPlan(null); }} />
            </div>
            <Button onClick={find} disabled={busy}>Find cover</Button>
          </div>
          {busy && <p className="text-sm text-muted-foreground">Checking the timetable…</p>}
          {plan && !busy && (
            plan.needs.length === 0 ? <p className="text-sm text-muted-foreground">This teacher has no lessons on {plan.weekday}. Nothing to cover.</p> : (
              <ul className="space-y-2 text-sm">
                {plan.needs.map((n) => {
                  const k = `${n.period_id}|${n.section_id}`;
                  return (
                    <li key={k} className="rounded-md border p-3 flex flex-col sm:flex-row sm:items-center gap-2 justify-between">
                      <div><div className="font-medium">{n.slot}</div><div className="text-muted-foreground">{n.section} · {n.course}</div></div>
                      {n.existing_proxy ? <span className="text-primary">Covered by {n.existing_proxy}</span>
                        : n.candidates.length === 0 ? <span className="text-destructive">No free teacher</span>
                        : (
                          <Select value={picks[k]} onValueChange={(v) => setPicks({ ...picks, [k]: v })}>
                            <SelectTrigger className="sm:w-64"><SelectValue /></SelectTrigger>
                            <SelectContent>{n.candidates.map((c) => <SelectItem key={c.teacher_id} value={c.teacher_id}>{c.teacher} — {c.reasons.join(", ")}</SelectItem>)}</SelectContent>
                          </Select>
                        )}
                    </li>
                  );
                })}
              </ul>
            )
          )}
          <DialogFooter>
            {plan && plan.needs.length > 0 && <Button variant="outline" onClick={() => print(plan)}><Printer className="h-4 w-4 mr-1" />Print slip</Button>}
            {plan && plan.needs.length > 0 && canEdit && <Button onClick={save} disabled={busy || !Object.keys(picks).length}>Confirm & print</Button>}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
