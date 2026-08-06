import { createFileRoute } from "@tanstack/react-router";
import { getActiveTenantName } from "@/lib/tenant-context";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EditableTabs } from "@/components/layout/editable";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Pencil, ListChecks, Printer, FileDown, ShieldAlert, Loader2, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/board")({
  component: BoardPage,
});

type Registration = {
  id: string; campus_id: string; student_id: string; board_name: string;
  level: "matric" | "inter"; group_name: string; session_year: string;
  part: string | null; roll_no: string | null; registration_no: string | null;
  exam_center: string | null; status: string; notes: string | null;
};

type Entry = {
  id: string; registration_id: string; subject_code: string; subject_name: string;
  paper: string | null; theory_max: number; practical_max: number;
  is_elective: boolean; display_order: number;
};

type ResultRow = {
  id: string; entry_id: string; theory_marks: number | null; practical_marks: number | null;
  total_marks: number | null; grade: string | null; status: string; remarks: string | null;
};

const GROUPS = [
  { v: "science", l: "Science" },
  { v: "arts", l: "Arts / Humanities" },
  { v: "commerce", l: "Commerce" },
  { v: "pre_medical", l: "Pre-Medical" },
  { v: "pre_engineering", l: "Pre-Engineering" },
  { v: "computer_science", l: "Computer Science" },
  { v: "general", l: "General" },
];

function BoardPage() {
  return (
    <>
      <PageHeader
        eyebrow="Academics"
        title="BISE Board"
        description="Register students for Matric / Inter, issue roll slips and admit cards, and record board results."
      />
      <EditableTabs scope="module:board" fallback="registrations">
        <TabsContent value="registrations" className="mt-4"><RegistrationsTab /></TabsContent>
        <TabsContent value="rollslips" className="mt-4"><RollSlipTab /></TabsContent>
        <TabsContent value="results" className="mt-4"><ResultsTab /></TabsContent>
      </EditableTabs>
    </>
  );
}

/* ----------------------------- Registrations ----------------------------- */

function RegistrationsTab() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Registration | null>(null);
  const [subjectsFor, setSubjectsFor] = useState<Registration | null>(null);

  const { data: campuses } = useQuery({
    queryKey: ["campuses"],
    queryFn: async () => (await supabase.from("campuses").select("id,name")).data ?? [],
  });
  const { data: students } = useQuery({
    queryKey: ["students-min"],
    queryFn: async () => (await supabase.from("students")
      .select("id, first_name, last_name, student_code, campus_id").order("first_name")).data ?? [],
  });
  const { data: regs, refetch } = useQuery({
    queryKey: ["board_registrations"],
    queryFn: async () => (await supabase.from("board_registrations")
      .select("*").order("created_at", { ascending: false })).data as Registration[] ?? [],
  });

  const [form, setForm] = useState<Partial<Registration>>({});

  function openNew() { setEditing(null); setForm({ board_name: "BISE", level: "matric", group_name: "science", session_year: String(new Date().getFullYear()), status: "draft" }); setOpen(true); }
  function openEdit(r: Registration) { setEditing(r); setForm(r); setOpen(true); }

  async function save() {
    if (!form.campus_id || !form.student_id || !form.board_name || !form.level || !form.group_name || !form.session_year)
      return toast.error("Fill all required fields");
    const payload = { ...form } as any;
    if (editing) {
      const { error } = await supabase.from("board_registrations").update(payload).eq("id", editing.id);
      if (error) return toast.error(error.message);
      toast.success("Registration updated");
    } else {
      const { error } = await supabase.from("board_registrations").insert(payload);
      if (error) return toast.error(error.message);
      toast.success("Registration created");
    }
    setOpen(false); refetch();
  }

  async function remove(r: Registration) {
    if (!confirm("Delete this registration and all its subjects & results?")) return;
    const { error } = await supabase.from("board_registrations").delete().eq("id", r.id);
    if (error) return toast.error(error.message);
    toast.success("Deleted"); refetch();
  }

  const studentName = (id: string) => {
    const s = students?.find((x) => x.id === id);
    return s ? `${s.first_name} ${s.last_name} · ${s.student_code}` : id.slice(0, 8);
  };
  const campusName = (id: string) => campuses?.find((c) => c.id === id)?.name ?? "";

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
                <TableHead>Student</TableHead>
                <TableHead>Campus</TableHead>
                <TableHead>Level</TableHead>
                <TableHead>Group</TableHead>
                <TableHead>Session</TableHead>
                <TableHead>Roll #</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(!regs || regs.length === 0) && (
                <TableRow><TableCell colSpan={8} className="py-8 text-center text-sm text-muted-foreground">No registrations yet.</TableCell></TableRow>
              )}
              {regs?.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="max-w-[220px] truncate">{studentName(r.student_id)}</TableCell>
                  <TableCell className="max-w-[140px] truncate">{campusName(r.campus_id)}</TableCell>
                  <TableCell className="capitalize">{r.level}</TableCell>
                  <TableCell className="capitalize">{r.group_name.replace("_", "-")}</TableCell>
                  <TableCell>{r.session_year}{r.part ? ` · Part ${r.part}` : ""}</TableCell>
                  <TableCell>{r.roll_no ?? "—"}</TableCell>
                  <TableCell><span className="rounded bg-slate-100 px-2 py-0.5 text-xs uppercase tracking-wide text-slate-700">{r.status}</span></TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => setSubjectsFor(r)}><ListChecks className="mr-1 h-4 w-4" /> Subjects</Button>
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
            <DialogTitle>{editing ? "Edit Registration" : "New Board Registration"}</DialogTitle>
            <DialogDescription>Register the student for a board examination session.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label>Student *</Label>
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
              <Label>Board name *</Label>
              <Input value={form.board_name ?? ""} onChange={(e) => setForm({ ...form, board_name: e.target.value })} placeholder="BISE Lahore" />
            </div>
            <div className="space-y-2">
              <Label>Level *</Label>
              <Select value={form.level ?? ""} onValueChange={(v: any) => setForm({ ...form, level: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="matric">Matric (SSC)</SelectItem>
                  <SelectItem value="inter">Intermediate (HSSC)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Group *</Label>
              <Select value={form.group_name ?? ""} onValueChange={(v: any) => setForm({ ...form, group_name: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {GROUPS.map((g) => <SelectItem key={g.v} value={g.v}>{g.l}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Session year *</Label>
              <Input value={form.session_year ?? ""} onChange={(e) => setForm({ ...form, session_year: e.target.value })} placeholder="2026" />
            </div>
            <div className="space-y-2">
              <Label>Part</Label>
              <Input value={form.part ?? ""} onChange={(e) => setForm({ ...form, part: e.target.value })} placeholder="I or II (Inter)" />
            </div>
            <div className="space-y-2">
              <Label>Roll no</Label>
              <Input value={form.roll_no ?? ""} onChange={(e) => setForm({ ...form, roll_no: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Registration no</Label>
              <Input value={form.registration_no ?? ""} onChange={(e) => setForm({ ...form, registration_no: e.target.value })} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Exam center</Label>
              <Input value={form.exam_center ?? ""} onChange={(e) => setForm({ ...form, exam_center: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={form.status ?? "draft"} onValueChange={(v: any) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["draft", "submitted", "approved", "rejected", "cancelled"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
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
        <SubjectsDialog reg={subjectsFor} onClose={() => setSubjectsFor(null)} />
      )}
    </>
  );
}

/* ------------------------------ Subjects ------------------------------- */

function SubjectsDialog({ reg, onClose }: { reg: Registration; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: entries, refetch } = useQuery({
    queryKey: ["board_entries", reg.id],
    queryFn: async () => (await supabase.from("board_exam_entries")
      .select("*").eq("registration_id", reg.id).order("display_order")).data as Entry[] ?? [],
  });
  const [row, setRow] = useState<Partial<Entry>>({ theory_max: 75, practical_max: 25, is_elective: false });

  async function add() {
    if (!row.subject_code || !row.subject_name) return toast.error("Code and name required");
    const { error } = await supabase.from("board_exam_entries").insert({
      registration_id: reg.id,
      subject_code: row.subject_code, subject_name: row.subject_name,
      paper: row.paper ?? null,
      theory_max: row.theory_max ?? 75, practical_max: row.practical_max ?? 25,
      is_elective: !!row.is_elective,
      display_order: (entries?.length ?? 0) + 1,
    });
    if (error) return toast.error(error.message);
    setRow({ theory_max: 75, practical_max: 25, is_elective: false });
    refetch();
  }
  async function del(id: string) {
    const { error } = await supabase.from("board_exam_entries").delete().eq("id", id);
    if (error) return toast.error(error.message);
    refetch();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto w-[95vw]">
        <DialogHeader>
          <DialogTitle>Subjects — {reg.level.toUpperCase()} {reg.session_year}</DialogTitle>
          <DialogDescription>Add each subject with theory / practical maximum marks.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[420px] overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Paper</TableHead>
                <TableHead className="w-24 text-right">Theory</TableHead>
                <TableHead className="w-24 text-right">Practical</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries?.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="font-mono text-xs">{e.subject_code}</TableCell>
                  <TableCell>{e.subject_name}</TableCell>
                  <TableCell>{e.paper ?? "—"}</TableCell>
                  <TableCell className="text-right">{Number(e.theory_max)}</TableCell>
                  <TableCell className="text-right">{Number(e.practical_max)}</TableCell>
                  <TableCell><Button size="sm" variant="ghost" onClick={() => del(e.id)}><Trash2 className="h-4 w-4" /></Button></TableCell>
                </TableRow>
              ))}
              {(!entries || entries.length === 0) && (
                <TableRow><TableCell colSpan={6} className="py-6 text-center text-sm text-muted-foreground">No subjects yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="grid grid-cols-2 gap-2 border-t pt-3 md:grid-cols-6">
          <Input placeholder="Code" value={row.subject_code ?? ""} onChange={(e) => setRow({ ...row, subject_code: e.target.value })} />
          <Input className="sm:col-span-2" placeholder="Subject name" value={row.subject_name ?? ""} onChange={(e) => setRow({ ...row, subject_name: e.target.value })} />
          <Input placeholder="Paper" value={row.paper ?? ""} onChange={(e) => setRow({ ...row, paper: e.target.value })} />
          <Input type="number" placeholder="Theory" value={row.theory_max ?? ""} onChange={(e) => setRow({ ...row, theory_max: Number(e.target.value) })} />
          <div className="flex gap-2">
            <Input type="number" placeholder="Prac" value={row.practical_max ?? ""} onChange={(e) => setRow({ ...row, practical_max: Number(e.target.value) })} />
            <Button onClick={add}><Plus className="h-4 w-4" /></Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------------- Roll Slips ------------------------------- */

function RollSlipTab() {
  const [regId, setRegId] = useState("");
  const [busy, setBusy] = useState(false);

  const { data: regs } = useQuery({
    queryKey: ["board_registrations_all"],
    queryFn: async () => (await supabase.from("board_registrations")
      .select("*").order("created_at", { ascending: false })).data ?? [],
  });
  const { data: students } = useQuery({
    queryKey: ["students-for-rollslip"],
    queryFn: async () => (await supabase.from("students")
      .select("id, first_name, last_name, student_code, guardian_name, date_of_birth, campus_id")).data ?? [],
  });
  const { data: campuses } = useQuery({
    queryKey: ["campuses-for-rollslip"],
    queryFn: async () => (await supabase.from("campuses").select("id,name")).data ?? [],
  });
  // Students with any unpaid / partial / overdue challan — filtered OUT of the dropdown.
  const { data: outstandingSet } = useQuery({
    queryKey: ["students_outstanding_set"],
    queryFn: async () => {
      const { data } = await supabase.from("fee_challans")
        .select("student_id, status").in("status", ["unpaid", "partial", "overdue"]);
      return new Set<string>((data ?? []).map((c: any) => c.student_id));
    },
  });

  const eligible = (regs ?? []).filter((r: any) => !outstandingSet?.has(r.student_id));
  const filteredOut = (regs?.length ?? 0) - eligible.length;

  const studentOf = (id: string) => students?.find((s) => s.id === id);
  const campusOf = (id: string) => campuses?.find((c) => c.id === id);

  async function printSlip(kind: "roll_slip" | "admit_card") {
    if (!regId) return toast.error("Select a registration");
    const r: any = regs?.find((x: any) => x.id === regId);
    if (!r) return;
    setBusy(true);
    try {
      const { data: outstanding, error: rpcErr } = await supabase.rpc("student_has_outstanding_challans", { _student_id: r.student_id });
      if (rpcErr) throw rpcErr;
      if (outstanding) {
        setBusy(false);
        return toast.error("Student has outstanding fee challans — clear dues before issuing.");
      }
      const { data: entries } = await supabase.from("board_exam_entries")
        .select("*").eq("registration_id", r.id).order("display_order");
      const subjRows = (entries ?? []).map((e: any, i: number) => `
        <tr>
          <td style="text-align:center">${i + 1}</td>
          <td>${e.subject_code}</td>
          <td>${e.subject_name}${e.paper ? ` (${e.paper})` : ""}</td>
          <td style="text-align:center">${Number(e.theory_max)} + ${Number(e.practical_max)}</td>
        </tr>`).join("");
      const st = studentOf(r.student_id); const c = campusOf(r.campus_id);
      const title = kind === "roll_slip" ? "ROLL NUMBER SLIP" : "ADMIT CARD";
      const w = window.open("", "_blank", "width=900,height=1100");
      if (!w) { setBusy(false); return; }
      w.document.write(`<!doctype html><html><head><title>${title} - ${st?.first_name} ${st?.last_name}</title>
        <meta name="color-scheme" content="light only">
        <style>
          :root { color-scheme: light; }
          html, body { background:#fff !important; color:#111 !important; }
          body { font-family: Georgia, serif; padding: 36px; }
          .h { text-align:center; border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 18px; }
          .h .sub { font-size: 10px; letter-spacing: 4px; text-transform: uppercase; color:#555; }
          .h h1 { margin: 4px 0 0; font-size: 20px; letter-spacing: 3px; }
          .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; font-size: 13px; margin: 14px 0 18px; }
          .grid div span { display:inline-block; min-width: 130px; color:#555; font-size: 11px; text-transform:uppercase; letter-spacing:1px; }
          table { width:100%; border-collapse: collapse; margin-top: 8px; }
          th, td { border: 1px solid #999; padding: 6px 8px; font-size: 12px; color:#111; background:#fff; }
          th { background:#f4f4f4 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .sig { margin-top: 50px; display:flex; justify-content: space-between; font-size: 12px; }
          .sig div { border-top: 1px solid #111; padding-top: 6px; width: 30%; text-align:center; }
          .stamp { text-align:right; font-size: 10px; color:#666; margin-top: 24px; }
          @media print { * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } }
        </style></head><body>
        <div class="h">
          <div class="sub">${c?.name ?? ""}</div>
          <h1>${title}</h1>
          <div class="sub">${r.board_name} · ${r.level.toUpperCase()} · ${r.session_year}${r.part ? " · Part " + r.part : ""}</div>
        </div>
        <div class="grid">
          <div><span>Candidate</span> <b>${st?.first_name ?? ""} ${st?.last_name ?? ""}</b></div>
          <div><span>Student code</span> ${st?.student_code ?? ""}</div>
          <div><span>Father / Guardian</span> ${st?.guardian_name ?? "—"}</div>
          <div><span>Date of birth</span> ${st?.date_of_birth ?? "—"}</div>
          <div><span>Roll no</span> <b>${r.roll_no ?? "—"}</b></div>
          <div><span>Registration no</span> ${r.registration_no ?? "—"}</div>
          <div><span>Group</span> ${String(r.group_name).replace("_", "-")}</div>
          <div><span>Exam center</span> ${r.exam_center ?? "—"}</div>
        </div>
        <table>
          <thead><tr><th style="width:36px">#</th><th style="width:80px">Code</th><th>Subject</th><th style="width:120px">Theory + Prac</th></tr></thead>
          <tbody>${subjRows || '<tr><td colspan="4" style="text-align:center">No subjects registered</td></tr>'}</tbody>
        </table>
        <div class="sig"><div>Candidate Signature</div><div>Controller of Examinations</div><div>Principal</div></div>
        <div class="stamp">Issued ${new Date().toLocaleDateString()} · ${getActiveTenantName()}</div>
        </body></html>`);
      w.document.close();
      setTimeout(() => w.print(), 400);
    } catch (e: any) {
      toast.error(e.message);
    } finally { setBusy(false); }
  }

  return (
    <Card className="shadow-none">
      <CardContent className="space-y-4 p-4">
        <div className="rounded-sm border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <ShieldAlert className="mr-1 inline h-3.5 w-3.5" />
          Only students with <b>no outstanding fee challans</b> appear below — synced automatically from Fees &amp; Finance.
          {filteredOut > 0 && (
            <div className="mt-1 opacity-80">{filteredOut} registration(s) hidden due to unpaid dues.</div>
          )}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label>Registration (fee-cleared students)</Label>
            <Select value={regId} onValueChange={setRegId}>
              <SelectTrigger><SelectValue placeholder={eligible.length ? "Pick a board registration" : "No fee-cleared registrations available"} /></SelectTrigger>
              <SelectContent>
                {eligible.map((r: any) => {
                  const s = studentOf(r.student_id);
                  const name = s ? `${s.first_name} ${s.last_name} · ${s.student_code}` : r.student_id.slice(0, 8);
                  return (
                    <SelectItem key={r.id} value={r.id}>
                      {name} — {r.level.toUpperCase()} {r.session_year} ({r.board_name})
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 border-t pt-4">
          <Button disabled={!regId || busy} onClick={() => printSlip("roll_slip")}>
            {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Printer className="mr-1 h-4 w-4" />} Print Roll Slip
          </Button>
          <Button variant="outline" disabled={!regId || busy} onClick={() => printSlip("admit_card")}>
            <Printer className="mr-1 h-4 w-4" /> Print Admit Card
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/* ------------------------------ Results -------------------------------- */

function ResultsTab() {
  const [regId, setRegId] = useState("");
  const { data: regs } = useQuery({
    queryKey: ["board_registrations_all_r"],
    queryFn: async () => (await supabase.from("board_registrations")
      .select("*, students(first_name,last_name,student_code)")
      .order("created_at", { ascending: false })).data ?? [],
  });

  const { data: entries, refetch } = useQuery({
    queryKey: ["board_entries_for_results", regId],
    enabled: !!regId,
    queryFn: async () => (await supabase.from("board_exam_entries")
      .select("*, board_results(*)").eq("registration_id", regId).order("display_order")).data ?? [],
  });

  async function saveRow(entry: any, patch: Partial<ResultRow>) {
    const existing = entry.board_results?.[0];
    const theory = patch.theory_marks ?? existing?.theory_marks ?? null;
    const prac = patch.practical_marks ?? existing?.practical_marks ?? null;
    const total = (Number(theory ?? 0) + Number(prac ?? 0)) || null;
    const payload = {
      entry_id: entry.id,
      theory_marks: theory, practical_marks: prac, total_marks: total,
      grade: patch.grade ?? existing?.grade ?? gradeFor(total, Number(entry.theory_max) + Number(entry.practical_max)),
      status: patch.status ?? existing?.status ?? "pass",
      remarks: patch.remarks ?? existing?.remarks ?? null,
      imported_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("board_results").upsert(payload, { onConflict: "entry_id" });
    if (error) return toast.error(error.message);
    refetch();
  }

  function printGazette() {
    if (!regId) return;
    const r: any = regs?.find((x: any) => x.id === regId);
    const rows = (entries ?? []).map((e: any) => {
      const res = e.board_results?.[0];
      return `<tr>
        <td>${e.subject_code}</td>
        <td>${e.subject_name}</td>
        <td style="text-align:center">${res?.theory_marks ?? "—"} / ${Number(e.theory_max)}</td>
        <td style="text-align:center">${res?.practical_marks ?? "—"} / ${Number(e.practical_max)}</td>
        <td style="text-align:center"><b>${res?.total_marks ?? "—"}</b></td>
        <td style="text-align:center">${res?.grade ?? "—"}</td>
        <td style="text-align:center">${res?.status ?? "—"}</td>
      </tr>`;
    }).join("");
    const totalObt = (entries ?? []).reduce((s: number, e: any) => s + Number(e.board_results?.[0]?.total_marks ?? 0), 0);
    const totalMax = (entries ?? []).reduce((s: number, e: any) => s + Number(e.theory_max) + Number(e.practical_max), 0);
    const w = window.open("", "_blank", "width=900,height=1100");
    if (!w) return;
    w.document.write(`<!doctype html><html><head><title>Result — ${r?.students?.first_name} ${r?.students?.last_name}</title>
      <meta name="color-scheme" content="light only">
      <style>
        :root { color-scheme: light; }
        html, body { background:#fff !important; color:#111 !important; }
        body { font-family: Georgia, serif; padding: 36px; }
        h1 { text-align:center; margin: 0 0 4px; font-size: 22px; letter-spacing: 3px; }
        .sub { text-align:center; font-size: 10px; letter-spacing: 4px; text-transform:uppercase; color:#555; margin-bottom: 18px; }
        table { width:100%; border-collapse: collapse; }
        th, td { border: 1px solid #999; padding: 6px 8px; font-size: 12px; background:#fff; color:#111; }
        th { background:#f4f4f4 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        .totals { margin-top: 16px; text-align:right; font-size: 14px; }
        @media print { * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } }
      </style></head><body>
      <div class="sub">${r?.board_name ?? ""}</div>
      <h1>RESULT STATEMENT</h1>
      <div class="sub">${r?.level?.toUpperCase()} · ${r?.session_year} · ${String(r?.group_name).replace("_", "-")}</div>
      <div style="font-size:13px;margin:12px 0"><b>${r?.students?.first_name} ${r?.students?.last_name}</b> — ${r?.students?.student_code} — Roll ${r?.roll_no ?? "—"}</div>
      <table>
        <thead><tr><th>Code</th><th>Subject</th><th>Theory</th><th>Practical</th><th>Total</th><th>Grade</th><th>Status</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div class="totals">Aggregate: <b>${totalObt} / ${totalMax}</b> (${totalMax ? ((totalObt / totalMax) * 100).toFixed(2) : "0"}%)</div>
      </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 400);
  }

  return (
    <Card className="shadow-none">
      <CardContent className="space-y-4 p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <div className="space-y-2">
            <Label>Registration</Label>
            <Select value={regId} onValueChange={setRegId}>
              <SelectTrigger><SelectValue placeholder="Pick a board registration" /></SelectTrigger>
              <SelectContent>
                {regs?.map((r: any) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.students?.first_name} {r.students?.last_name} — {r.level.toUpperCase()} {r.session_year}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <Button variant="outline" disabled={!regId} onClick={printGazette}>
              <FileDown className="mr-1 h-4 w-4" /> Print Result
            </Button>
          </div>
        </div>

        {regId && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subject</TableHead>
                  <TableHead className="w-28">Theory</TableHead>
                  <TableHead className="w-28">Practical</TableHead>
                  <TableHead className="w-24">Grade</TableHead>
                  <TableHead className="w-32">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries?.map((e: any) => {
                  const res: ResultRow | undefined = e.board_results?.[0];
                  return (
                    <TableRow key={e.id}>
                      <TableCell>
                        <div className="font-medium">{e.subject_name}</div>
                        <div className="text-[10px] text-muted-foreground">{e.subject_code} · max {Number(e.theory_max) + Number(e.practical_max)}</div>
                      </TableCell>
                      <TableCell>
                        <Input type="number" defaultValue={res?.theory_marks ?? ""} onBlur={(ev) => {
                          const v = ev.target.value === "" ? null : Number(ev.target.value);
                          saveRow(e, { theory_marks: v });
                        }} />
                      </TableCell>
                      <TableCell>
                        <Input type="number" defaultValue={res?.practical_marks ?? ""} onBlur={(ev) => {
                          const v = ev.target.value === "" ? null : Number(ev.target.value);
                          saveRow(e, { practical_marks: v });
                        }} />
                      </TableCell>
                      <TableCell>
                        <Input defaultValue={res?.grade ?? ""} onBlur={(ev) => saveRow(e, { grade: ev.target.value })} />
                      </TableCell>
                      <TableCell>
                        <Select value={res?.status ?? "pending"} onValueChange={(v) => saveRow(e, { status: v as any })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {["pass", "fail", "absent", "withheld", "pending"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {(!entries || entries.length === 0) && (
                  <TableRow><TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">No subjects registered.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function gradeFor(total: number | null, max: number): string | null {
  if (total == null || !max) return null;
  const p = (total / max) * 100;
  if (p >= 80) return "A+";
  if (p >= 70) return "A";
  if (p >= 60) return "B";
  if (p >= 50) return "C";
  if (p >= 40) return "D";
  if (p >= 33) return "E";
  return "F";
}
