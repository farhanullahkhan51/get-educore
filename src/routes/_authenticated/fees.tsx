import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Wallet, AlertTriangle, CheckCircle2, Upload, Link2, Eye, Printer } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";

export const Route = createFileRoute("/_authenticated/fees")({
  component: FeesPage,
});

type FeeStructure = {
  id: string;
  campus_id: string;
  program_id: string | null;
  class_id: string | null;
  name: string;
  category: "tuition" | "admission" | "exam" | "transport" | "hostel" | "other";
  amount: number;
  frequency: "monthly" | "term" | "annual" | "one_time";
  academic_year: string | null;
  active: boolean;
  notes: string | null;
};

type Challan = {
  id: string;
  challan_no: string;
  campus_id: string;
  student_id: string;
  category: FeeStructure["category"];
  period_label: string | null;
  issue_date: string;
  due_date: string;
  gross_amount: number;
  discount_amount: number;
  fine_amount: number;
  paid_amount: number;
  status: "unpaid" | "partial" | "paid" | "waived" | "overdue";
  paid_on: string | null;
  scholarship_id: string | null;
  fee_structure_id: string | null;
  notes: string | null;
};

type Scholarship = {
  id: string;
  campus_id: string;
  student_id: string;
  name: string;
  scholarship_type: "percentage" | "fixed";
  value: number;
  status: "active" | "expired" | "revoked";
  reason: string | null;
  starts_on: string | null;
  ends_on: string | null;
};

type BankTxn = {
  id: string;
  campus_id: string;
  bank_account_id: string | null;
  txn_date: string;
  reference: string | null;
  description: string | null;
  amount: number;
  matched_challan_id: string | null;
};

type BankAccount = {
  id: string;
  campus_id: string;
  bank_name: string;
  account_title: string;
  account_number: string;
  iban: string | null;
  branch: string | null;
  active: boolean;
};

const PKR = new Intl.NumberFormat("en-PK", { style: "currency", currency: "PKR", maximumFractionDigits: 0 });

function statusBadge(s: Challan["status"]) {
  const cls: Record<string, string> = {
    unpaid: "bg-muted text-foreground",
    partial: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
    paid: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200",
    waived: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
    overdue: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  };
  return <Badge className={cls[s]}>{s}</Badge>;
}

function FeesPage() {
  const { data: user } = useCurrentUser();
  const canManage = !!user?.roles.some((r) => ["super_admin", "campus_admin", "finance_officer"].includes(r));

  const { data: campuses } = useQuery({
    queryKey: ["campuses"],
    queryFn: async () => (await supabase.from("campuses").select("id, name, code").order("name")).data ?? [],
  });
  const { data: programs } = useQuery({
    queryKey: ["programs"],
    queryFn: async () => (await supabase.from("programs").select("id, name, campus_id")).data ?? [],
  });
  const { data: classes } = useQuery({
    queryKey: ["classes"],
    queryFn: async () => (await supabase.from("classes").select("id, name, campus_id")).data ?? [],
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Fees & Finance"
        description="Fee structures, challan generation, bank reconciliation, and scholarships."
      />
      {!canManage && (
        <Card>
          <CardContent className="p-6 text-sm text-muted-foreground">
            You have view-only access to this module.
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="challans" className="space-y-4">
        <TabsList>
          <TabsTrigger value="challans">Challans</TabsTrigger>
          <TabsTrigger value="structures">Fee Structures</TabsTrigger>
          <TabsTrigger value="scholarships">Scholarships</TabsTrigger>
          <TabsTrigger value="bank">Bank Reconciliation</TabsTrigger>
        </TabsList>

        <TabsContent value="challans">
          <ChallansTab canManage={canManage} campuses={campuses ?? []} classes={classes ?? []} />
        </TabsContent>
        <TabsContent value="structures">
          <StructuresTab canManage={canManage} campuses={campuses ?? []} programs={programs ?? []} classes={classes ?? []} />
        </TabsContent>
        <TabsContent value="scholarships">
          <ScholarshipsTab canManage={canManage} campuses={campuses ?? []} />
        </TabsContent>
        <TabsContent value="bank">
          <BankTab canManage={canManage} campuses={campuses ?? []} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* --------------------------------- STRUCTURES ---------------------------------- */

function StructuresTab({
  canManage, campuses, programs, classes,
}: {
  canManage: boolean;
  campuses: Array<{ id: string; name: string }>;
  programs: Array<{ id: string; name: string; campus_id: string }>;
  classes: Array<{ id: string; name: string; campus_id: string }>;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<FeeStructure | null>(null);
  const [campusFilter, setCampusFilter] = useState<string>("all");

  const { data: rows, isLoading } = useQuery({
    queryKey: ["fee_structures"],
    queryFn: async () => {
      const { data, error } = await supabase.from("fee_structures").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as FeeStructure[];
    },
  });

  const filtered = (rows ?? []).filter((r) => campusFilter === "all" || r.campus_id === campusFilter);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = {
      campus_id: String(fd.get("campus_id")),
      program_id: (fd.get("program_id") ? String(fd.get("program_id")) : null) as string | null,
      class_id: (fd.get("class_id") ? String(fd.get("class_id")) : null) as string | null,
      name: String(fd.get("name")),
      category: String(fd.get("category")) as FeeStructure["category"],
      amount: Number(fd.get("amount")),
      frequency: String(fd.get("frequency")) as FeeStructure["frequency"],
      academic_year: String(fd.get("academic_year") || "") || null,
      notes: String(fd.get("notes") || "") || null,
      active: fd.get("active") === "on",
    };
    const res = editing
      ? await supabase.from("fee_structures").update(payload).eq("id", editing.id)
      : await supabase.from("fee_structures").insert(payload);
    if (res.error) return toast.error(res.error.message);
    toast.success(editing ? "Fee structure updated" : "Fee structure created");
    setOpen(false);
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["fee_structures"] });
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this fee structure?")) return;
    const { error } = await supabase.from("fee_structures").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: ["fee_structures"] });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
        <div>
          <CardTitle>Fee Structures</CardTitle>
        </div>
        <div className="flex items-center gap-2">
          <Select value={campusFilter} onValueChange={setCampusFilter}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All campuses</SelectItem>
              {campuses.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {canManage && (
            <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
              <DialogTrigger asChild>
                <Button><Plus className="mr-2 h-4 w-4" /> New Structure</Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>{editing ? "Edit fee structure" : "New fee structure"}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit} className="space-y-3">
                  <div>
                    <Label>Campus</Label>
                    <Select name="campus_id" defaultValue={editing?.campus_id} required>
                      <SelectTrigger><SelectValue placeholder="Select campus" /></SelectTrigger>
                      <SelectContent>
                        {campuses.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Program (optional)</Label>
                      <Select name="program_id" defaultValue={editing?.program_id ?? undefined}>
                        <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                        <SelectContent>
                          {programs.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Class (optional)</Label>
                      <Select name="class_id" defaultValue={editing?.class_id ?? undefined}>
                        <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                        <SelectContent>
                          {classes.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label>Name</Label>
                    <Input name="name" defaultValue={editing?.name} required placeholder="e.g. Monthly Tuition — Grade 9" />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label>Category</Label>
                      <Select name="category" defaultValue={editing?.category ?? "tuition"}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {["tuition","admission","exam","transport","hostel","other"].map((c) =>
                            <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Amount (PKR)</Label>
                      <Input name="amount" type="number" min="0" step="1" defaultValue={editing?.amount} required />
                    </div>
                    <div>
                      <Label>Frequency</Label>
                      <Select name="frequency" defaultValue={editing?.frequency ?? "monthly"}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {["monthly","term","annual","one_time"].map((c) =>
                            <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <Label>Academic Year</Label>
                    <Input name="academic_year" defaultValue={editing?.academic_year ?? ""} placeholder="2025-26" />
                  </div>
                  <div>
                    <Label>Notes</Label>
                    <Textarea name="notes" defaultValue={editing?.notes ?? ""} rows={2} />
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" name="active" defaultChecked={editing?.active ?? true} /> Active
                  </label>
                  <DialogFooter>
                    <Button type="submit">{editing ? "Update" : "Create"}</Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground">No fee structures yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Frequency</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead>Year</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>{r.category}</TableCell>
                  <TableCell>{r.frequency}</TableCell>
                  <TableCell className="text-right">{PKR.format(r.amount)}</TableCell>
                  <TableCell>{r.academic_year ?? "—"}</TableCell>
                  <TableCell>{r.active ? <Badge>Active</Badge> : <Badge variant="secondary">Inactive</Badge>}</TableCell>
                  <TableCell className="text-right">
                    {canManage && (
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" onClick={() => { setEditing(r); setOpen(true); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="icon" variant="ghost" onClick={() => handleDelete(r.id)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

/* --------------------------------- CHALLANS ------------------------------------ */

function ChallansTab({
  canManage, campuses, classes,
}: {
  canManage: boolean;
  campuses: Array<{ id: string; name: string; code: string }>;
  classes: Array<{ id: string; name: string; campus_id: string }>;
}) {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [campusFilter, setCampusFilter] = useState<string>("all");
  const [generatorOpen, setGeneratorOpen] = useState(false);
  const [payingFor, setPayingFor] = useState<Challan | null>(null);
  const [viewing, setViewing] = useState<Challan | null>(null);
  const [editing, setEditing] = useState<Challan | null>(null);

  const { data: challans, isLoading } = useQuery({
    queryKey: ["fee_challans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fee_challans")
        .select("*")
        .order("due_date", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data as Challan[];
    },
  });

  const { data: students } = useQuery({
    queryKey: ["students-min"],
    queryFn: async () =>
      (await supabase.from("students").select("id, student_code, first_name, last_name, campus_id, class_id")).data ?? [],
  });
  const { data: structures } = useQuery({
    queryKey: ["fee_structures"],
    queryFn: async () => (await supabase.from("fee_structures").select("*").eq("active", true)).data ?? [],
  });
  const { data: scholarships } = useQuery({
    queryKey: ["scholarships"],
    queryFn: async () => (await supabase.from("scholarships").select("*").eq("status", "active")).data ?? [],
  });

  const studentMap = useMemo(() => {
    const m = new Map<string, { code: string; name: string; campus_id: string; class_id: string | null }>();
    (students ?? []).forEach((s: any) =>
      m.set(s.id, { code: s.student_code, name: `${s.first_name} ${s.last_name}`, campus_id: s.campus_id, class_id: s.class_id }),
    );
    return m;
  }, [students]);

  const filtered = (challans ?? []).filter((c) => {
    if (statusFilter !== "all" && c.status !== statusFilter) return false;
    if (campusFilter !== "all" && c.campus_id !== campusFilter) return false;
    return true;
  });

  const kpi = useMemo(() => {
    const now = new Date().toISOString().slice(0, 10);
    let totalDue = 0, totalCollected = 0, defaulters = 0;
    (challans ?? []).forEach((c) => {
      const net = Number(c.gross_amount) - Number(c.discount_amount) + Number(c.fine_amount);
      totalDue += net;
      totalCollected += Number(c.paid_amount);
      if (c.status !== "paid" && c.status !== "waived" && c.due_date < now) defaulters += 1;
    });
    return { totalDue, totalCollected, outstanding: totalDue - totalCollected, defaulters };
  }, [challans]);

  async function markPaid(c: Challan, amount: number, ref: string) {
    const net = Number(c.gross_amount) - Number(c.discount_amount) + Number(c.fine_amount);
    const newPaid = Number(c.paid_amount) + amount;
    const status: Challan["status"] = newPaid >= net ? "paid" : newPaid > 0 ? "partial" : "unpaid";
    const { error } = await supabase
      .from("fee_challans")
      .update({
        paid_amount: newPaid,
        status,
        paid_on: status === "paid" ? new Date().toISOString().slice(0, 10) : c.paid_on,
      })
      .eq("id", c.id);
    if (error) return toast.error(error.message);
    await supabase.from("fee_ledger").insert({
      campus_id: c.campus_id,
      challan_id: c.id,
      entry_type: "payment",
      amount,
      notes: ref || null,
    });
    toast.success("Payment recorded");
    setPayingFor(null);
    qc.invalidateQueries({ queryKey: ["fee_challans"] });
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this challan?")) return;
    const { error } = await supabase.from("fee_challans").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: ["fee_challans"] });
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <KpiCard icon={<Wallet className="h-4 w-4" />} label="Total Billed" value={PKR.format(kpi.totalDue)} />
        <KpiCard icon={<CheckCircle2 className="h-4 w-4" />} label="Collected" value={PKR.format(kpi.totalCollected)} />
        <KpiCard icon={<Wallet className="h-4 w-4" />} label="Outstanding" value={PKR.format(kpi.outstanding)} />
        <KpiCard icon={<AlertTriangle className="h-4 w-4" />} label="Defaulters" value={String(kpi.defaulters)} tone="danger" />
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle>Challans</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={campusFilter} onValueChange={setCampusFilter}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All campuses</SelectItem>
                {campuses.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {["unpaid","partial","paid","overdue","waived"].map((s) =>
                  <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
            {canManage && (
              <Button onClick={() => setGeneratorOpen(true)}>
                <Plus className="mr-2 h-4 w-4" /> Generate Challans
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground">No challans yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Challan #</TableHead>
                  <TableHead>Student</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Due</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead className="text-right">Paid</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => {
                  const s = studentMap.get(c.student_id);
                  const net = Number(c.gross_amount) - Number(c.discount_amount) + Number(c.fine_amount);
                  const now = new Date().toISOString().slice(0, 10);
                  const isOverdue = c.status !== "paid" && c.status !== "waived" && c.due_date < now;
                  return (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-xs">{c.challan_no}</TableCell>
                      <TableCell>
                        <div className="text-sm">{s?.name ?? "—"}</div>
                        <div className="text-xs text-muted-foreground">{s?.code ?? ""}</div>
                      </TableCell>
                      <TableCell>{c.period_label ?? "—"}</TableCell>
                      <TableCell>
                        <span className={isOverdue ? "text-red-600 font-medium" : ""}>{c.due_date}</span>
                      </TableCell>
                      <TableCell className="text-right">{PKR.format(net)}</TableCell>
                      <TableCell className="text-right">{PKR.format(Number(c.paid_amount))}</TableCell>
                      <TableCell>{statusBadge(isOverdue && c.status === "unpaid" ? "overdue" : c.status)}</TableCell>
                      <TableCell className="text-right">
                        {canManage && (
                          <div className="flex justify-end gap-1">
                            {c.status !== "paid" && c.status !== "waived" && (
                              <Button size="sm" variant="outline" onClick={() => setPayingFor(c)}>Record Payment</Button>
                            )}
                            <Button size="icon" variant="ghost" onClick={() => handleDelete(c.id)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {generatorOpen && (
        <GeneratorDialog
          open={generatorOpen}
          onOpenChange={setGeneratorOpen}
          campuses={campuses}
          classes={classes}
          students={(students ?? []) as any}
          structures={(structures ?? []) as any}
          scholarships={(scholarships ?? []) as any}
          existingChallans={challans ?? []}
          onDone={() => qc.invalidateQueries({ queryKey: ["fee_challans"] })}
        />
      )}

      {payingFor && (
        <Dialog open={!!payingFor} onOpenChange={(o) => !o && setPayingFor(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Record Payment — {payingFor.challan_no}</DialogTitle>
              <DialogDescription>
                Net: {PKR.format(Number(payingFor.gross_amount) - Number(payingFor.discount_amount) + Number(payingFor.fine_amount))}
                {" · "}Already paid: {PKR.format(Number(payingFor.paid_amount))}
              </DialogDescription>
            </DialogHeader>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                markPaid(payingFor, Number(fd.get("amount")), String(fd.get("reference") || ""));
              }}
              className="space-y-3"
            >
              <div>
                <Label>Amount (PKR)</Label>
                <Input name="amount" type="number" min="1" step="1" required
                  defaultValue={Number(payingFor.gross_amount) - Number(payingFor.discount_amount) + Number(payingFor.fine_amount) - Number(payingFor.paid_amount)}
                />
              </div>
              <div>
                <Label>Reference / Note</Label>
                <Input name="reference" placeholder="Bank txn ID, cash receipt #, etc." />
              </div>
              <DialogFooter>
                <Button type="submit">Save Payment</Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function KpiCard({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: string; tone?: "danger" }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-muted-foreground">
          {icon} {label}
        </div>
        <div className={`mt-2 font-serif text-2xl font-semibold ${tone === "danger" ? "text-red-600" : ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

/* -------------------------- CHALLAN BULK GENERATOR ----------------------------- */

function GeneratorDialog({
  open, onOpenChange, campuses, classes, students, structures, scholarships, existingChallans, onDone,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  campuses: Array<{ id: string; name: string; code: string }>;
  classes: Array<{ id: string; name: string; campus_id: string }>;
  students: Array<{ id: string; student_code: string; first_name: string; last_name: string; campus_id: string; class_id: string | null }>;
  structures: FeeStructure[];
  scholarships: Scholarship[];
  existingChallans: Challan[];
  onDone: () => void;
}) {
  const [campusId, setCampusId] = useState<string>("");
  const [structureId, setStructureId] = useState<string>("");
  const [classId, setClassId] = useState<string>("all");
  const [period, setPeriod] = useState<string>(() => new Date().toISOString().slice(0, 7));
  const [dueDate, setDueDate] = useState<string>(() => {
    const d = new Date(); d.setDate(10); d.setMonth(d.getMonth() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [busy, setBusy] = useState(false);

  const eligible = students.filter((s) =>
    (!campusId || s.campus_id === campusId) && (classId === "all" || s.class_id === classId),
  );
  const structure = structures.find((s) => s.id === structureId);

  async function submit() {
    if (!campusId || !structure) return toast.error("Pick campus and fee structure");
    if (eligible.length === 0) return toast.error("No students match");
    setBusy(true);
    const campus = campuses.find((c) => c.id === campusId);
    const yymm = period.replace("-", "").slice(2); // YYMM
    const prefix = `${campus?.code ?? "CMP"}-${yymm}`;

    // Determine next sequence: count existing challans with same prefix
    const usedSeq = new Set(
      existingChallans
        .filter((c) => c.challan_no.startsWith(prefix))
        .map((c) => parseInt(c.challan_no.split("-").pop() || "0", 10)),
    );
    let seq = 1;
    const nextSeq = () => {
      while (usedSeq.has(seq)) seq += 1;
      usedSeq.add(seq);
      return seq;
    };

    // Skip students who already have a challan for this structure+period
    const alreadyKey = new Set(
      existingChallans
        .filter((c) => c.fee_structure_id === structure.id && c.period_label === period)
        .map((c) => c.student_id),
    );

    const rows = eligible
      .filter((s) => !alreadyKey.has(s.id))
      .map((s) => {
        const sch = scholarships.find((x) => x.student_id === s.id && x.status === "active");
        const discount = !sch ? 0
          : sch.scholarship_type === "percentage" ? Math.round((Number(structure.amount) * Number(sch.value)) / 100)
          : Number(sch.value);
        const n = nextSeq();
        return {
          challan_no: `${prefix}-${String(n).padStart(4, "0")}`,
          campus_id: campusId,
          student_id: s.id,
          fee_structure_id: structure.id,
          scholarship_id: sch?.id ?? null,
          category: structure.category,
          period_label: period,
          issue_date: new Date().toISOString().slice(0, 10),
          due_date: dueDate,
          gross_amount: Number(structure.amount),
          discount_amount: discount,
          fine_amount: 0,
          paid_amount: 0,
          status: "unpaid" as const,
        };
      });

    if (rows.length === 0) {
      setBusy(false);
      return toast.info("All eligible students already have challans for this period.");
    }

    const { error } = await supabase.from("fee_challans").insert(rows);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`${rows.length} challan(s) generated`);
    onOpenChange(false);
    onDone();
  }

  const campusStructures = structures.filter((s) => !campusId || s.campus_id === campusId);
  const campusClasses = classes.filter((c) => !campusId || c.campus_id === campusId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Generate Challans</DialogTitle>
          <DialogDescription>Bulk-create challans for a fee structure. Scholarships are applied automatically.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Campus</Label>
            <Select value={campusId} onValueChange={(v) => { setCampusId(v); setStructureId(""); setClassId("all"); }}>
              <SelectTrigger><SelectValue placeholder="Select campus" /></SelectTrigger>
              <SelectContent>
                {campuses.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Fee Structure</Label>
            <Select value={structureId} onValueChange={setStructureId} disabled={!campusId}>
              <SelectTrigger><SelectValue placeholder="Select structure" /></SelectTrigger>
              <SelectContent>
                {campusStructures.map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name} — {PKR.format(s.amount)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Class (optional)</Label>
              <Select value={classId} onValueChange={setClassId} disabled={!campusId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All classes</SelectItem>
                  {campusClasses.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Period (YYYY-MM)</Label>
              <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Due Date</Label>
            <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
          <div className="rounded-md border p-3 text-sm">
            <div className="flex justify-between"><span>Eligible students</span><strong>{eligible.length}</strong></div>
            {structure && (
              <div className="flex justify-between"><span>Base amount</span><strong>{PKR.format(structure.amount)}</strong></div>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy || !structure || eligible.length === 0}>
            {busy ? "Generating…" : `Generate ${eligible.length} challan(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* --------------------------------- SCHOLARSHIPS -------------------------------- */

function ScholarshipsTab({ canManage, campuses }: {
  canManage: boolean;
  campuses: Array<{ id: string; name: string }>;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Scholarship | null>(null);

  const { data: rows, isLoading } = useQuery({
    queryKey: ["scholarships"],
    queryFn: async () => (await supabase.from("scholarships").select("*").order("created_at", { ascending: false })).data as Scholarship[] ?? [],
  });
  const { data: students } = useQuery({
    queryKey: ["students-min"],
    queryFn: async () =>
      (await supabase.from("students").select("id, student_code, first_name, last_name, campus_id")).data ?? [],
  });

  const studentMap = useMemo(() => {
    const m = new Map<string, string>();
    (students ?? []).forEach((s: any) => m.set(s.id, `${s.first_name} ${s.last_name} (${s.student_code})`));
    return m;
  }, [students]);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const student_id = String(fd.get("student_id"));
    const student = (students ?? []).find((s: any) => s.id === student_id) as any;
    if (!student) return toast.error("Pick a student");
    const payload = {
      campus_id: student.campus_id,
      student_id,
      name: String(fd.get("name")),
      scholarship_type: String(fd.get("scholarship_type")) as Scholarship["scholarship_type"],
      value: Number(fd.get("value")),
      reason: String(fd.get("reason") || "") || null,
      status: String(fd.get("status")) as Scholarship["status"],
      starts_on: String(fd.get("starts_on") || "") || null,
      ends_on: String(fd.get("ends_on") || "") || null,
    };
    const res = editing
      ? await supabase.from("scholarships").update(payload).eq("id", editing.id)
      : await supabase.from("scholarships").insert(payload);
    if (res.error) return toast.error(res.error.message);
    toast.success(editing ? "Scholarship updated" : "Scholarship granted");
    setOpen(false);
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["scholarships"] });
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this scholarship?")) return;
    const { error } = await supabase.from("scholarships").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: ["scholarships"] });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>Scholarships</CardTitle>
        {canManage && (
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" /> Grant Scholarship</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>{editing ? "Edit scholarship" : "Grant scholarship"}</DialogTitle></DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-3">
                <div>
                  <Label>Student</Label>
                  <Select name="student_id" defaultValue={editing?.student_id} required>
                    <SelectTrigger><SelectValue placeholder="Pick a student" /></SelectTrigger>
                    <SelectContent>
                      {(students ?? []).map((s: any) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.first_name} {s.last_name} ({s.student_code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Name / Title</Label>
                  <Input name="name" defaultValue={editing?.name} required placeholder="Merit-based, Need-based, etc." />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Type</Label>
                    <Select name="scholarship_type" defaultValue={editing?.scholarship_type ?? "percentage"}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="percentage">Percentage (%)</SelectItem>
                        <SelectItem value="fixed">Fixed (PKR)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Value</Label>
                    <Input name="value" type="number" min="0" step="0.01" defaultValue={editing?.value} required />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Starts on</Label>
                    <Input name="starts_on" type="date" defaultValue={editing?.starts_on ?? ""} />
                  </div>
                  <div>
                    <Label>Ends on</Label>
                    <Input name="ends_on" type="date" defaultValue={editing?.ends_on ?? ""} />
                  </div>
                </div>
                <div>
                  <Label>Status</Label>
                  <Select name="status" defaultValue={editing?.status ?? "active"}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["active","expired","revoked"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Reason / Notes</Label>
                  <Textarea name="reason" defaultValue={editing?.reason ?? ""} rows={2} />
                </div>
                <DialogFooter>
                  <Button type="submit">{editing ? "Update" : "Grant"}</Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p>
          : (rows ?? []).length === 0 ? <p className="text-sm text-muted-foreground">No scholarships yet.</p>
          : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Student</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(rows ?? []).map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-sm">{studentMap.get(r.student_id) ?? "—"}</TableCell>
                    <TableCell>{r.name}</TableCell>
                    <TableCell>{r.scholarship_type}</TableCell>
                    <TableCell className="text-right">
                      {r.scholarship_type === "percentage" ? `${r.value}%` : PKR.format(r.value)}
                    </TableCell>
                    <TableCell><Badge variant={r.status === "active" ? "default" : "secondary"}>{r.status}</Badge></TableCell>
                    <TableCell className="text-right">
                      {canManage && (
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" onClick={() => { setEditing(r); setOpen(true); }}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => handleDelete(r.id)}>
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
      </CardContent>
    </Card>
  );
}

/* --------------------------------- BANK RECON ---------------------------------- */

function BankTab({ canManage, campuses }: {
  canManage: boolean;
  campuses: Array<{ id: string; name: string }>;
}) {
  const qc = useQueryClient();
  const [campusId, setCampusId] = useState<string>("");
  const [importOpen, setImportOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [matching, setMatching] = useState<BankTxn | null>(null);

  const { data: accounts } = useQuery({
    queryKey: ["bank_accounts"],
    queryFn: async () => (await supabase.from("bank_accounts").select("*").order("bank_name")).data as BankAccount[] ?? [],
  });

  const { data: txns, isLoading } = useQuery({
    queryKey: ["bank_transactions"],
    queryFn: async () =>
      (await supabase.from("bank_transactions").select("*").order("txn_date", { ascending: false }).limit(500)).data as BankTxn[] ?? [],
  });

  const filteredTxns = (txns ?? []).filter((t) => !campusId || t.campus_id === campusId);
  const filteredAccounts = (accounts ?? []).filter((a) => !campusId || a.campus_id === campusId);

  async function handleAccountSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const { error } = await supabase.from("bank_accounts").insert({
      campus_id: String(fd.get("campus_id")),
      bank_name: String(fd.get("bank_name")),
      account_title: String(fd.get("account_title")),
      account_number: String(fd.get("account_number")),
      iban: String(fd.get("iban") || "") || null,
      branch: String(fd.get("branch") || "") || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Bank account added");
    setAccountOpen(false);
    qc.invalidateQueries({ queryKey: ["bank_accounts"] });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Bank Accounts</CardTitle>
          <div className="flex items-center gap-2">
            <Select value={campusId || "all"} onValueChange={(v) => setCampusId(v === "all" ? "" : v)}>
              <SelectTrigger className="w-44"><SelectValue placeholder="All campuses" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All campuses</SelectItem>
                {campuses.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {canManage && (
              <Dialog open={accountOpen} onOpenChange={setAccountOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline"><Plus className="mr-2 h-4 w-4" />Add Account</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader><DialogTitle>Add bank account</DialogTitle></DialogHeader>
                  <form onSubmit={handleAccountSubmit} className="space-y-3">
                    <div>
                      <Label>Campus</Label>
                      <Select name="campus_id" required>
                        <SelectTrigger><SelectValue placeholder="Select campus" /></SelectTrigger>
                        <SelectContent>{campuses.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>Bank Name</Label><Input name="bank_name" required /></div>
                      <div><Label>Branch</Label><Input name="branch" /></div>
                    </div>
                    <div><Label>Account Title</Label><Input name="account_title" required /></div>
                    <div className="grid grid-cols-2 gap-3">
                      <div><Label>Account Number</Label><Input name="account_number" required /></div>
                      <div><Label>IBAN</Label><Input name="iban" /></div>
                    </div>
                    <DialogFooter><Button type="submit">Add</Button></DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>
            )}
            {canManage && (
              <Button onClick={() => setImportOpen(true)}>
                <Upload className="mr-2 h-4 w-4" /> Import CSV
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0 sm:p-6">
          {filteredAccounts.length === 0 ? (
            <p className="text-sm text-muted-foreground p-6">No bank accounts yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table className="min-w-full">
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Bank</TableHead>
                    <TableHead className="whitespace-nowrap">Title</TableHead>
                    <TableHead className="whitespace-nowrap">Number</TableHead>
                    <TableHead className="whitespace-nowrap">Branch</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAccounts.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="max-w-[160px] truncate whitespace-nowrap">{a.bank_name}</TableCell>
                      <TableCell className="max-w-[200px] truncate whitespace-nowrap">{a.account_title}</TableCell>
                      <TableCell className="font-mono text-xs max-w-[180px] truncate whitespace-nowrap">{a.account_number}</TableCell>
                      <TableCell className="max-w-[160px] truncate whitespace-nowrap">{a.branch ?? "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Bank Transactions</CardTitle></CardHeader>
        <CardContent className="p-0 sm:p-6">
          {isLoading ? <p className="text-sm text-muted-foreground p-6">Loading…</p>
            : filteredTxns.length === 0 ? <p className="text-sm text-muted-foreground p-6">No transactions imported yet.</p>
            : (
              <div className="overflow-x-auto">
                <Table className="min-w-full">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap">Date</TableHead>
                      <TableHead className="whitespace-nowrap">Reference</TableHead>
                      <TableHead className="whitespace-nowrap">Description</TableHead>
                      <TableHead className="whitespace-nowrap text-right">Amount</TableHead>
                      <TableHead className="whitespace-nowrap">Status</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTxns.map((t) => (
                      <TableRow key={t.id}>
                        <TableCell className="whitespace-nowrap">{t.txn_date}</TableCell>
                        <TableCell className="font-mono text-xs max-w-[180px] truncate whitespace-nowrap">{t.reference ?? "—"}</TableCell>
                        <TableCell className="max-w-xs truncate">{t.description ?? "—"}</TableCell>
                        <TableCell className="text-right whitespace-nowrap">{PKR.format(Number(t.amount))}</TableCell>
                        <TableCell>
                          {t.matched_challan_id
                            ? <Badge className="bg-emerald-100 text-emerald-800">matched</Badge>
                            : <Badge variant="secondary">unmatched</Badge>}
                        </TableCell>
                        <TableCell className="text-right whitespace-nowrap">
                          {canManage && !t.matched_challan_id && (
                            <Button size="sm" variant="outline" onClick={() => setMatching(t)}>
                              <Link2 className="mr-1 h-3 w-3" /> Match
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
        </CardContent>
      </Card>

      {importOpen && (
        <ImportCsvDialog
          open={importOpen}
          onOpenChange={setImportOpen}
          campuses={campuses}
          accounts={accounts ?? []}
          onDone={() => qc.invalidateQueries({ queryKey: ["bank_transactions"] })}
        />
      )}

      {matching && (
        <MatchDialog
          txn={matching}
          onClose={() => setMatching(null)}
          onDone={() => {
            qc.invalidateQueries({ queryKey: ["bank_transactions"] });
            qc.invalidateQueries({ queryKey: ["fee_challans"] });
          }}
        />
      )}
    </div>
  );
}

function parseCsv(text: string): Array<Record<string, string>> {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const cells = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => (row[h] = cells[i] ?? ""));
    return row;
  });
}

function ImportCsvDialog({
  open, onOpenChange, campuses, accounts, onDone,
}: {
  open: boolean;
  onOpenChange: (b: boolean) => void;
  campuses: Array<{ id: string; name: string }>;
  accounts: BankAccount[];
  onDone: () => void;
}) {
  const [campusId, setCampusId] = useState("");
  const [accountId, setAccountId] = useState<string>("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function onFile(f: File) {
    setText(await f.text());
  }

  async function submit() {
    if (!campusId) return toast.error("Pick campus");
    const rows = parseCsv(text);
    if (rows.length === 0) return toast.error("No rows detected. Expected columns: date, reference, description, amount");
    setBusy(true);
    const batch = `batch-${Date.now()}`;
    const payload = rows.map((r) => ({
      campus_id: campusId,
      bank_account_id: accountId || null,
      txn_date: r.date || new Date().toISOString().slice(0, 10),
      reference: r.reference || r.ref || null,
      description: r.description || r.desc || null,
      amount: Number(r.amount || "0"),
      import_batch: batch,
    })).filter((r) => !Number.isNaN(r.amount));
    const { error } = await supabase.from("bank_transactions").insert(payload);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`${payload.length} transaction(s) imported`);
    onOpenChange(false);
    onDone();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Import Bank Statement</DialogTitle>
          <DialogDescription>
            CSV columns: <code>date, reference, description, amount</code>. Amount in PKR.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Campus</Label>
            <Select value={campusId} onValueChange={setCampusId}>
              <SelectTrigger><SelectValue placeholder="Select campus" /></SelectTrigger>
              <SelectContent>{campuses.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div>
            <Label>Bank Account (optional)</Label>
            <Select value={accountId} onValueChange={setAccountId} disabled={!campusId}>
              <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
              <SelectContent>
                {accounts.filter((a) => a.campus_id === campusId).map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.bank_name} — {a.account_number}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Upload CSV</Label>
            <Input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          </div>
          <div>
            <Label>Or paste CSV</Label>
            <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={6}
              placeholder="date,reference,description,amount&#10;2025-08-05,TX9012,STD-001 tuition,15000" />
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={busy || !text.trim()}>{busy ? "Importing…" : "Import"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MatchDialog({ txn, onClose, onDone }: { txn: BankTxn; onClose: () => void; onDone: () => void }) {
  const [query, setQuery] = useState<string>(txn.reference ?? "");
  const { data: candidates } = useQuery({
    queryKey: ["challan-candidates", txn.campus_id],
    queryFn: async () =>
      (await supabase.from("fee_challans")
        .select("*")
        .eq("campus_id", txn.campus_id)
        .neq("status", "paid")
        .neq("status", "waived")
        .order("due_date", { ascending: false })
        .limit(200)).data as Challan[] ?? [],
  });

  const q = query.toLowerCase();
  const list = (candidates ?? []).filter((c) => !q || c.challan_no.toLowerCase().includes(q));

  async function match(c: Challan) {
    const net = Number(c.gross_amount) - Number(c.discount_amount) + Number(c.fine_amount);
    const applied = Math.min(Number(txn.amount), net - Number(c.paid_amount));
    const newPaid = Number(c.paid_amount) + applied;
    const status: Challan["status"] = newPaid >= net ? "paid" : "partial";
    const { error: e1 } = await supabase
      .from("fee_challans")
      .update({
        paid_amount: newPaid,
        status,
        paid_on: status === "paid" ? new Date().toISOString().slice(0, 10) : c.paid_on,
      })
      .eq("id", c.id);
    if (e1) return toast.error(e1.message);
    const { error: e2 } = await supabase
      .from("bank_transactions")
      .update({ matched_challan_id: c.id, matched_at: new Date().toISOString() })
      .eq("id", txn.id);
    if (e2) return toast.error(e2.message);
    await supabase.from("fee_ledger").insert({
      campus_id: c.campus_id,
      challan_id: c.id,
      entry_type: "bank_match",
      amount: applied,
      bank_transaction_id: txn.id,
      notes: `Matched to bank txn ${txn.reference ?? txn.id}`,
    });
    toast.success("Matched");
    onClose();
    onDone();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Match Transaction</DialogTitle>
          <DialogDescription>
            {txn.txn_date} · {PKR.format(Number(txn.amount))} · {txn.description ?? "—"}
          </DialogDescription>
        </DialogHeader>
        <Input placeholder="Search challan #" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="max-h-80 overflow-y-auto rounded-md border">
          <Table>
            <TableBody>
              {list.slice(0, 50).map((c) => {
                const net = Number(c.gross_amount) - Number(c.discount_amount) + Number(c.fine_amount);
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-mono text-xs">{c.challan_no}</TableCell>
                    <TableCell className="text-right">{PKR.format(net - Number(c.paid_amount))}</TableCell>
                    <TableCell className="w-24 text-right">
                      <Button size="sm" onClick={() => match(c)}>Match</Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
