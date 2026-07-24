import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Pencil, ListChecks, Printer, Trash2, Loader2, Save } from "lucide-react";
import { getActiveTenantName, useTenantId } from "@/lib/tenant-context";

export const Route = createFileRoute("/_authenticated/cambridge")({
  component: CambridgePage,
});

type Registration = {
  id: string; campus_id: string; student_id: string;
  centre_number: string | null; candidate_number: string | null;
  level: "igcse" | "o_level" | "as_level" | "a_level" | "checkpoint" | "primary";
  session: "feb_march" | "may_june" | "oct_nov";
  session_year: string; status: string; notes: string | null;
};

type Entry = {
  id: string; registration_id: string; syllabus_code: string; subject_name: string;
  components: string | null; tier: string | null;
  is_carry_forward: boolean; display_order: number;
};

type ResultRow = {
  id: string; entry_id: string; ums: number | null; percentage: number | null;
  grade: string | null; status: string; remarks: string | null;
};

const LEVELS = [
  { v: "primary", l: "Cambridge Primary" },
  { v: "checkpoint", l: "Checkpoint" },
  { v: "igcse", l: "IGCSE" },
  { v: "o_level", l: "O Level" },
  { v: "as_level", l: "AS Level" },
  { v: "a_level", l: "A Level" },
];
const SESSIONS = [
  { v: "feb_march", l: "February / March" },
  { v: "may_june", l: "May / June" },
  { v: "oct_nov", l: "October / November" },
];

function CambridgePage() {
  return (
    <>
      <PageHeader
        eyebrow="Academics"
        title="Cambridge Assessment"
        description="Register candidates for Cambridge (IGCSE, O/A Level, Checkpoint), manage syllabus entries and record statement of results."
      />
      <Tabs defaultValue="registrations">
        <TabsList>
          <TabsTrigger value="registrations">Registrations</TabsTrigger>
          <TabsTrigger value="statements">Statements of Entry</TabsTrigger>
          <TabsTrigger value="results">Results</TabsTrigger>
        </TabsList>
        <TabsContent value="registrations" className="mt-4"><RegistrationsTab /></TabsContent>
        <TabsContent value="statements" className="mt-4"><StatementTab /></TabsContent>
        <TabsContent value="results" className="mt-4"><ResultsTab /></TabsContent>
      </Tabs>
    </>
  );
}

/* ----------------------------- Registrations ----------------------------- */

function RegistrationsTab() {
  const tenantId = useTenantId();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Registration | null>(null);
  const [subjectsFor, setSubjectsFor] = useState<Registration | null>(null);

  const { data: campuses } = useQuery({
    queryKey: ["campuses"],
    queryFn: async () => (await supabase.from("campuses").select("id,name")).data ?? [],
  });
  const { data: students } = useQuery({
    queryKey: ["students-min-cam"],
    queryFn: async () => (await supabase.from("students")
      .select("id, first_name, last_name, student_code, campus_id, academic_system")
      .order("first_name")).data ?? [],
  });
  const { data: regs, refetch } = useQuery({
    queryKey: ["cambridge_registrations"],
    queryFn: async () => (await supabase.from("cambridge_registrations")
      .select("*").order("created_at", { ascending: false })).data as Registration[] ?? [],
  });

  const [form, setForm] = useState<Partial<Registration>>({});
  function openNew() {
    setEditing(null);
    setForm({ level: "igcse", session: "may_june", session_year: String(new Date().getFullYear()), status: "draft" });
    setOpen(true);
  }
  function openEdit(r: Registration) { setEditing(r); setForm(r); setOpen(true); }

  async function save() {
    if (!form.campus_id || !form.student_id || !form.level || !form.session || !form.session_year)
      return toast.error("Fill all required fields");
    const payload = { ...form } as any;
    if (editing) {
      const { error } = await supabase.from("cambridge_registrations").update(payload).eq("id", editing.id);
      if (error) return toast.error(error.message);
      toast.success("Registration updated");
    } else {
      const { error } = await supabase.from("cambridge_registrations").insert(payload);
      if (error) return toast.error(error.message);
      toast.success("Registration created");
    }
    setOpen(false); refetch();
  }

  async function remove(r: Registration) {
    if (!confirm("Delete this Cambridge registration and all its entries?")) return;
    const { error } = await supabase.from("cambridge_registrations").delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success("Deleted"); refetch();
  }

  const studentName = (id: string) => {
    const s = students?.find((x) => x.id === id);
    return s ? `${s.first_name} ${s.last_name} · ${s.student_code}` : id.slice(0, 8);
  };
  const campusName = (id: string) => campuses?.find((c) => c.id === id)?.name ?? "";
  const levelLabel = (v: string) => LEVELS.find((x) => x.v === v)?.l ?? v;
  const sessionLabel = (v: string) => SESSIONS.find((x) => x.v === v)?.l ?? v;

  return (
    <>
      <div className="mb-3 flex justify-end">
        <Button onClick={openNew}><Plus className="mr-1 h-4 w-4" /> New Registration</Button>
      </div>
      <Card className="shadow-none">
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Candidate</TableHead>
                <TableHead>Campus</TableHead>
                <TableHead>Level</TableHead>
                <TableHead>Session</TableHead>
                <TableHead>Centre</TableHead>
                <TableHead>Candidate #</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(!regs || regs.length === 0) && (
                <TableRow><TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">No Cambridge registrations yet.</TableCell></TableRow>
              )}
              {regs?.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="max-w-[220px] truncate">{studentName(r.student_id)}</TableCell>
                  <TableCell className="max-w-[140px] truncate">{campusName(r.campus_id)}</TableCell>
                  <TableCell>{levelLabel(r.level)}</TableCell>
                  <TableCell>{sessionLabel(r.session)} {r.session_year}</TableCell>
                  <TableCell>{r.centre_number ?? "—"}</TableCell>
                  <TableCell>{r.candidate_number ?? "—"}</TableCell>
                  <TableCell><span className="rounded bg-slate-100 px-2 py-0.5 text-xs uppercase tracking-wide text-slate-700">{r.status}</span></TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => setSubjectsFor(r)}><ListChecks className="mr-1 h-4 w-4" /> Entries</Button>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(r)}><Pencil className="h-4 w-4" /></Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(r)}><Trash2 className="h-4 w-4" /></Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto w-[95vw]">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Cambridge Registration" : "New Cambridge Registration"}</DialogTitle>
            <DialogDescription>Enter Cambridge candidate details and session.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Candidate *</Label>
              <Select value={form.student_id ?? ""} onValueChange={(v) => {
                const s = students?.find((x) => x.id === v);
                setForm({ ...form, student_id: v, campus_id: s?.campus_id ?? form.campus_id });
              }}>
                <SelectTrigger><SelectValue placeholder="Select student" /></SelectTrigger>
                <SelectContent>
                  {students?.map((s) => <SelectItem key={s.id} value={s.id}>{s.first_name} {s.last_name} · {s.student_code}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Level *</Label>
              <Select value={form.level ?? ""} onValueChange={(v: any) => setForm({ ...form, level: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEVELS.map((g) => <SelectItem key={g.v} value={g.v}>{g.l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Session *</Label>
              <Select value={form.session ?? ""} onValueChange={(v: any) => setForm({ ...form, session: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SESSIONS.map((g) => <SelectItem key={g.v} value={g.v}>{g.l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Session year *</Label>
              <Input value={form.session_year ?? ""} onChange={(e) => setForm({ ...form, session_year: e.target.value })} placeholder="2026" />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.status ?? "draft"} onValueChange={(v: any) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["draft", "submitted", "confirmed", "results_out", "cancelled"].map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Centre number</Label>
              <Input value={form.centre_number ?? ""} onChange={(e) => setForm({ ...form, centre_number: e.target.value })} placeholder="PK123" />
            </div>
            <div className="space-y-2">
              <Label>Candidate number</Label>
              <Input value={form.candidate_number ?? ""} onChange={(e) => setForm({ ...form, candidate_number: e.target.value })} placeholder="0123" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Notes</Label>
              <Textarea value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter><Button onClick={save}>{editing ? "Save" : "Create"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {subjectsFor && (
        <EntriesDialog reg={subjectsFor} onClose={() => setSubjectsFor(null)} />
      )}
    </>
  );
}

/* ------------------------------ Entries -------------------------------- */

function EntriesDialog({ reg, onClose }: { reg: Registration; onClose: () => void }) {
  const { data: entries, refetch } = useQuery({
    queryKey: ["cambridge_entries", reg.id],
    queryFn: async () => (await supabase.from("cambridge_subject_entries")
      .select("*").eq("registration_id", reg.id).order("display_order")).data as Entry[] ?? [],
  });
  const [row, setRow] = useState<Partial<Entry>>({ is_carry_forward: false });

  const tenantId = useTenantId();
  async function add() {
    if (!row.syllabus_code || !row.subject_name) return toast.error("Syllabus code and name required");
    if (!tenantId) return toast.error("Tenant not resolved");
    const { error } = await supabase.from("cambridge_subject_entries").insert({
      tenant_id: tenantId,
      registration_id: reg.id,
      syllabus_code: row.syllabus_code, subject_name: row.subject_name,
      components: row.components ?? null, tier: row.tier ?? null,
      is_carry_forward: !!row.is_carry_forward,
      display_order: (entries?.length ?? 0) + 1,
    });
    if (error) return toast.error(error.message);
    setRow({ is_carry_forward: false });
    refetch();
  }
  async function del(id: string) {
    const { error } = await supabase.from("cambridge_subject_entries").delete().eq("id", id);
    if (error) return toast.error(error.message);
    refetch();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto w-[95vw]">
        <DialogHeader>
          <DialogTitle>Syllabus entries — {reg.level.toUpperCase()} {reg.session_year}</DialogTitle>
          <DialogDescription>List syllabus codes, components (e.g. 11/21/41) and tier if applicable.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[420px] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Syllabus</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Components</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>CF</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries?.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-mono text-xs">{e.syllabus_code}</TableCell>
                  <TableCell>{e.subject_name}</TableCell>
                  <TableCell>{e.components ?? "—"}</TableCell>
                  <TableCell>{e.tier ?? "—"}</TableCell>
                  <TableCell>{e.is_carry_forward ? "Yes" : "—"}</TableCell>
                  <TableCell><Button size="sm" variant="ghost" onClick={() => del(e.id)}><Trash2 className="h-4 w-4" /></Button></TableCell>
                </TableRow>
              ))}
              {(!entries || entries.length === 0) && (
                <TableRow><TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">No entries yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="grid grid-cols-2 gap-2 border-t pt-3 md:grid-cols-6">
          <Input placeholder="0580" value={row.syllabus_code ?? ""} onChange={(e) => setRow({ ...row, syllabus_code: e.target.value })} />
          <Input className="md:col-span-2" placeholder="Subject name (Mathematics)" value={row.subject_name ?? ""} onChange={(e) => setRow({ ...row, subject_name: e.target.value })} />
          <Input placeholder="11/21/41" value={row.components ?? ""} onChange={(e) => setRow({ ...row, components: e.target.value })} />
          <Input placeholder="Core / Extended" value={row.tier ?? ""} onChange={(e) => setRow({ ...row, tier: e.target.value })} />
          <div className="flex gap-2">
            <label className="flex items-center gap-1 text-xs">
              <input type="checkbox" checked={!!row.is_carry_forward} onChange={(e) => setRow({ ...row, is_carry_forward: e.target.checked })} /> CF
            </label>
            <Button onClick={add}><Plus className="h-4 w-4" /></Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* --------------------------- Statement of Entry -------------------------- */

function StatementTab() {
  const [regId, setRegId] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: regs } = useQuery({
    queryKey: ["cambridge_registrations_all"],
    queryFn: async () => (await supabase.from("cambridge_registrations")
      .select("*").order("created_at", { ascending: false })).data ?? [],
  });
  const { data: students } = useQuery({
    queryKey: ["students-for-cam-stmt"],
    queryFn: async () => (await supabase.from("students")
      .select("id, first_name, last_name, student_code, guardian_name, date_of_birth, campus_id")).data ?? [],
  });
  const { data: campuses } = useQuery({
    queryKey: ["campuses-for-cam-stmt"],
    queryFn: async () => (await supabase.from("campuses").select("id,name")).data ?? [],
  });
  const { data: outstandingSet } = useQuery({
    queryKey: ["students_outstanding_set_cam"],
    queryFn: async () => {
      const { data } = await supabase.from("fee_challans")
        .select("student_id, status").in("status", ["unpaid", "partial", "overdue"]);
      return new Set<string>((data ?? []).map((c: any) => c.student_id));
    },
  });

  const eligible = (regs ?? []).filter((r: any) => !outstandingSet?.has(r.student_id));
  const filteredOut = (regs?.length ?? 0) - eligible.length;

  async function printStatement() {
    if (!regId) return toast.error("Select a registration");
    const r: any = regs?.find((x: any) => x.id === regId);
    if (!r) return;
    setBusy(true);
    try {
      const { data: outstanding } = await supabase.rpc("student_has_outstanding_challans", { _student_id: r.student_id });
      if (outstanding) { setBusy(false); return toast.error("Student has outstanding fees — clear dues first."); }
      const { data: entries } = await supabase.from("cambridge_subject_entries")
        .select("*").eq("registration_id", r.id).order("display_order");
      const s = students?.find((x) => x.id === r.student_id);
      const c = campuses?.find((x) => x.id === r.campus_id);
      const rows = (entries ?? []).map((e: any, i: number) => `
        <tr>
          <td style="text-align:center">${i + 1}</td>
          <td>${e.syllabus_code}</td>
          <td>${e.subject_name}</td>
          <td style="text-align:center">${e.components ?? "—"}</td>
          <td style="text-align:center">${e.tier ?? "—"}</td>
          <td style="text-align:center">${e.is_carry_forward ? "CF" : ""}</td>
        </tr>`).join("");
      const sessionLabel = SESSIONS.find((x) => x.v === r.session)?.l ?? r.session;
      const levelLabel = LEVELS.find((x) => x.v === r.level)?.l ?? r.level;
      const w = window.open("", "_blank", "width=900,height=1100");
      if (!w) { setBusy(false); return; }
      w.document.write(`<!doctype html><html><head><title>Statement of Entry - ${s?.first_name} ${s?.last_name}</title>
        <meta name="color-scheme" content="light only">
        <style>
          :root { color-scheme: light; }
          html,body{background:#fff !important;color:#111 !important;}
          body{font-family:Georgia,serif;padding:36px;}
          .h{text-align:center;border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:18px;}
          .h .sub{font-size:10px;letter-spacing:4px;text-transform:uppercase;color:#555;}
          .h h1{margin:4px 0 0;font-size:20px;letter-spacing:3px;}
          .grid{display:grid;grid-template-columns:1fr 1fr;gap:8px 16px;font-size:13px;margin:14px 0 18px;}
          .grid div span{display:inline-block;min-width:140px;color:#555;font-size:11px;text-transform:uppercase;letter-spacing:1px;}
          table{width:100%;border-collapse:collapse;margin-top:8px;}
          th,td{border:1px solid #999;padding:6px 8px;font-size:12px;color:#111;background:#fff;}
          th{background:#f4f4f4 !important;-webkit-print-color-adjust:exact;print-color-adjust:exact;}
          .sig{margin-top:50px;display:flex;justify-content:space-between;font-size:12px;}
          .sig div{border-top:1px solid #111;padding-top:6px;width:30%;text-align:center;}
          .stamp{text-align:right;font-size:10px;color:#666;margin-top:24px;}
          @media print{*{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;}}
        </style></head><body>
        <div class="h">
          <div class="sub">${getActiveTenantName()} · ${c?.name ?? ""}</div>
          <h1>STATEMENT OF ENTRY</h1>
          <div class="sub">Cambridge Assessment International Education</div>
        </div>
        <div class="grid">
          <div><span>Candidate</span> ${s?.first_name ?? ""} ${s?.last_name ?? ""}</div>
          <div><span>Student ID</span> ${s?.student_code ?? ""}</div>
          <div><span>Guardian</span> ${s?.guardian_name ?? "—"}</div>
          <div><span>Date of birth</span> ${s?.date_of_birth ?? "—"}</div>
          <div><span>Centre no.</span> ${r.centre_number ?? "—"}</div>
          <div><span>Candidate no.</span> ${r.candidate_number ?? "—"}</div>
          <div><span>Qualification</span> ${levelLabel}</div>
          <div><span>Session</span> ${sessionLabel} ${r.session_year}</div>
        </div>
        <table>
          <thead><tr>
            <th>#</th><th>Syllabus</th><th>Subject</th><th>Components</th><th>Tier</th><th>CF</th>
          </tr></thead>
          <tbody>${rows || `<tr><td colspan="6" style="text-align:center;padding:14px">No entries added.</td></tr>`}</tbody>
        </table>
        <div class="sig">
          <div>Exams Officer</div><div>Head of Centre</div><div>Candidate signature</div>
        </div>
        <div class="stamp">Generated ${new Date().toLocaleString()}</div>
        <script>window.onload=()=>window.print()</script>
        </body></html>`);
      w.document.close();
    } finally { setBusy(false); }
  }

  return (
    <Card className="shadow-none">
      <CardContent className="p-6 space-y-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] items-end">
          <div className="space-y-2">
            <Label>Pick a Cambridge registration (fee-clear only)</Label>
            <Select value={regId} onValueChange={setRegId}>
              <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
              <SelectContent>
                {eligible.map((r: any) => {
                  const s = students?.find((x) => x.id === r.student_id);
                  return <SelectItem key={r.id} value={r.id}>{s ? `${s.first_name} ${s.last_name} · ${s.student_code}` : r.id.slice(0, 8)} · {LEVELS.find(x=>x.v===r.level)?.l} · {r.session_year}</SelectItem>;
                })}
              </SelectContent>
            </Select>
            {filteredOut > 0 && (
              <p className="text-xs text-muted-foreground">{filteredOut} registration(s) hidden due to unpaid fees.</p>
            )}
          </div>
          <Button onClick={printStatement} disabled={busy}>
            {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Printer className="mr-1 h-4 w-4" />} Statement of Entry
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------- Results -------------------------------- */

function ResultsTab() {
  const [regId, setRegId] = useState("");
  const tenantId = useTenantId();

  const { data: regs } = useQuery({
    queryKey: ["cambridge_registrations_for_results"],
    queryFn: async () => (await supabase.from("cambridge_registrations")
      .select("*").order("created_at", { ascending: false })).data ?? [],
  });
  const { data: students } = useQuery({
    queryKey: ["students-for-cam-results"],
    queryFn: async () => (await supabase.from("students")
      .select("id, first_name, last_name, student_code")).data ?? [],
  });
  const { data: entries } = useQuery({
    queryKey: ["cambridge_entries_res", regId],
    enabled: !!regId,
    queryFn: async () => (await supabase.from("cambridge_subject_entries")
      .select("*").eq("registration_id", regId).order("display_order")).data as Entry[] ?? [],
  });
  const { data: results, refetch: refetchResults } = useQuery({
    queryKey: ["cambridge_results", regId],
    enabled: !!regId,
    queryFn: async () => {
      const ids = (entries ?? []).map((e) => e.id);
      if (ids.length === 0) return [] as ResultRow[];
      const { data } = await supabase.from("cambridge_results").select("*").in("entry_id", ids);
      return (data ?? []) as ResultRow[];
    },
  });

  const resultOf = (entryId: string) => results?.find((r) => r.entry_id === entryId);
  const studentName = (r: any) => {
    const s = students?.find((x) => x.id === r?.student_id);
    return s ? `${s.first_name} ${s.last_name} · ${s.student_code}` : "";
  };

  const [draft, setDraft] = useState<Record<string, Partial<ResultRow>>>({});
  function edit(entryId: string, patch: Partial<ResultRow>) {
    setDraft((d) => ({ ...d, [entryId]: { ...(resultOf(entryId) ?? {}), ...(d[entryId] ?? {}), ...patch } }));
  }
  async function saveRow(entryId: string) {
    const cur = draft[entryId]; if (!cur) return;
    if (!tenantId) return toast.error("Tenant not resolved");
    const existing = resultOf(entryId);
    const basePayload = {
      ums: cur.ums ?? null, percentage: cur.percentage ?? null,
      grade: cur.grade ?? null, status: cur.status ?? "pending",
      remarks: cur.remarks ?? null, imported_at: new Date().toISOString(),
    };
    if (existing) {
      const { error } = await supabase.from("cambridge_results").update(basePayload).eq("id", existing.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("cambridge_results").insert({ entry_id: entryId, tenant_id: tenantId, ...basePayload });
      if (error) return toast.error(error.message);
    }
    toast.success("Result saved");
    setDraft((d) => { const n = { ...d }; delete n[entryId]; return n; });
    refetchResults();
  }


  const selected = regs?.find((r: any) => r.id === regId);

  return (
    <Card className="shadow-none">
      <CardContent className="p-6 space-y-4">
        <div className="space-y-2 max-w-xl">
          <Label>Registration</Label>
          <Select value={regId} onValueChange={(v) => { setRegId(v); setDraft({}); }}>
            <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
            <SelectContent>
              {regs?.map((r: any) => (
                <SelectItem key={r.id} value={r.id}>
                  {studentName(r)} · {LEVELS.find(x=>x.v===r.level)?.l} · {r.session_year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {regId && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Syllabus</TableHead>
                  <TableHead>Subject</TableHead>
                  <TableHead className="w-24 text-right">UMS</TableHead>
                  <TableHead className="w-24 text-right">%</TableHead>
                  <TableHead className="w-24">Grade</TableHead>
                  <TableHead className="w-32">Status</TableHead>
                  <TableHead>Remarks</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(entries ?? []).map((e) => {
                  const cur = { ...(resultOf(e.id) ?? {}), ...(draft[e.id] ?? {}) } as Partial<ResultRow>;
                  const dirty = !!draft[e.id];
                  return (
                    <TableRow key={e.id}>
                      <TableCell className="font-mono text-xs">{e.syllabus_code}</TableCell>
                      <TableCell>{e.subject_name}{e.components ? ` (${e.components})` : ""}</TableCell>
                      <TableCell className="text-right">
                        <Input type="number" className="h-8 text-right" value={cur.ums ?? ""} onChange={(ev) => edit(e.id, { ums: ev.target.value === "" ? null : Number(ev.target.value) })} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Input type="number" step="0.01" className="h-8 text-right" value={cur.percentage ?? ""} onChange={(ev) => edit(e.id, { percentage: ev.target.value === "" ? null : Number(ev.target.value) })} />
                      </TableCell>
                      <TableCell><Input className="h-8 uppercase" maxLength={3} value={cur.grade ?? ""} onChange={(ev) => edit(e.id, { grade: ev.target.value.toUpperCase() })} /></TableCell>
                      <TableCell>
                        <Select value={cur.status ?? "pending"} onValueChange={(v) => edit(e.id, { status: v })}>
                          <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {["pending","pass","fail","withheld","ungraded"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell><Input className="h-8" value={cur.remarks ?? ""} onChange={(ev) => edit(e.id, { remarks: ev.target.value })} /></TableCell>
                      <TableCell><Button size="sm" variant="ghost" disabled={!dirty} onClick={() => saveRow(e.id)}><Save className="h-4 w-4" /></Button></TableCell>
                    </TableRow>
                  );
                })}
                {(!entries || entries.length === 0) && (
                  <TableRow><TableCell colSpan={8} className="py-6 text-center text-sm text-muted-foreground">No entries for this registration.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
