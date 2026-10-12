import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Printer, Check, X, Banknote, Trash2, Pencil, Wallet } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { EXPENSE_CATEGORIES, PAYMENT_MODES, categoryLabel, expenseTotal, modeLabel, pettyCashBalance, spentTotal } from "@/lib/expenses";

export const Route = createFileRoute("/_authenticated/expenses")({
  head: () => ({
    meta: [
      { title: "Expenses & Petty Cash" },
      { name: "description", content: "Record school expense vouchers, approve and pay them, and track the petty cash balance." },
      { property: "og:title", content: "Expenses & Petty Cash" },
      { property: "og:description", content: "Expense vouchers, approvals and petty cash for every campus." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ExpensesPage,
});

type Expense = {
  id: string; campus_id: string; voucher_no: string | null; entry_type: string; category: string; payee: string;
  payment_mode: string; reference: string | null; amount: number; tax_amount: number; expense_date: string;
  status: string; description: string; receipt_url: string | null;
};
type Form = { id?: string; campus_id: string; entry_type: string; category: string; payee: string; payment_mode: string;
  reference: string; amount: string; tax_amount: string; expense_date: string; description: string; receipt_url: string };

const money = (n: number) => `PKR ${Number(n).toLocaleString("en-PK", { maximumFractionDigits: 2 })}`;
const monthStart = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`; };
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const STATUS_VARIANT: Record<string, "secondary" | "default" | "destructive" | "outline"> = { draft: "outline", approved: "secondary", paid: "default", rejected: "destructive" };
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

function ExpensesPage() {
  const { data: user } = useCurrentUser();
  const qc = useQueryClient();
  const isSuper = !!user?.roles.includes("super_admin");
  const [from, setFrom] = useState(monthStart());
  const [to, setTo] = useState(today());
  const [campus, setCampus] = useState("all");
  const [category, setCategory] = useState("all");
  const [status, setStatus] = useState("all");
  const [form, setForm] = useState<Form | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: campuses = [] } = useQuery({
    queryKey: ["exp-campuses"],
    queryFn: async () => (await supabase.from("campuses").select("id,name").order("name")).data ?? [],
  });
  const campusName = useMemo(() => new Map(campuses.map((c) => [c.id, c.name])), [campuses]);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["expenses", from, to, campus],
    queryFn: async () => {
      let q = supabase.from("expenses").select("*").gte("expense_date", from).lte("expense_date", to).order("expense_date", { ascending: false }).order("voucher_no", { ascending: false });
      if (campus !== "all") q = q.eq("campus_id", campus);
      const { data, error } = await q.limit(5000);
      if (error) throw error;
      return data as Expense[];
    },
  });
  // Petty balance is all-time, not limited to the date filter.
  const { data: pettyRows = [] } = useQuery({
    queryKey: ["expenses-petty", campus],
    queryFn: async () => {
      let q = supabase.from("expenses").select("entry_type,payment_mode,status,amount,tax_amount").or("entry_type.eq.petty_topup,payment_mode.eq.petty_cash");
      if (campus !== "all") q = q.eq("campus_id", campus);
      const { data, error } = await q.limit(50000);
      if (error) throw error;
      return data;
    },
  });

  const visible = rows.filter((r) => (category === "all" || r.category === category) && (status === "all" || r.status === status));
  const spent = spentTotal(rows);
  const pending = rows.filter((r) => r.status === "draft");
  const outflow = rows.filter((r) => r.entry_type === "expense" && r.status === "paid").reduce((s, r) => s + expenseTotal(r), 0);
  const petty = pettyCashBalance(pettyRows as any);

  const refresh = () => { qc.invalidateQueries({ queryKey: ["expenses"] }); qc.invalidateQueries({ queryKey: ["expenses-petty"] }); qc.invalidateQueries({ queryKey: ["finance-pnl"] }); };

  const openNew = (entry_type = "expense") => setForm({
    campus_id: campus !== "all" ? campus : user?.campusId ?? campuses[0]?.id ?? "", entry_type,
    category: entry_type === "petty_topup" ? "other" : "utilities", payee: "", payment_mode: entry_type === "petty_topup" ? "cash" : "cash",
    reference: "", amount: "", tax_amount: "0", expense_date: today(), description: "", receipt_url: "",
  });
  const openEdit = (e: Expense) => setForm({ ...e, reference: e.reference ?? "", receipt_url: e.receipt_url ?? "", amount: String(e.amount), tax_amount: String(e.tax_amount) });

  async function save() {
    if (!form) return;
    const amount = Number(form.amount), tax = Number(form.tax_amount || 0);
    if (!form.campus_id) return toast.error("Choose a campus");
    if (!(amount > 0)) return toast.error("Enter an amount greater than zero");
    if (tax < 0 || Number.isNaN(tax)) return toast.error("Tax cannot be negative");
    if (form.entry_type === "expense" && !form.payee.trim()) return toast.error("Enter who was paid");
    if (form.receipt_url && !/^https?:\/\//i.test(form.receipt_url)) return toast.error("Receipt link must start with http:// or https://");
    if (form.entry_type === "expense" && form.payment_mode === "petty_cash" && !form.id && expenseTotal({ amount, tax_amount: tax }) > petty)
      toast.warning("This is more than the current petty cash balance");
    setBusy(true);
    const payload = {
      campus_id: form.campus_id, entry_type: form.entry_type, category: form.entry_type === "petty_topup" ? "other" : form.category,
      payee: form.payee.trim() || (form.entry_type === "petty_topup" ? "Petty cash float" : ""), payment_mode: form.entry_type === "petty_topup" ? "cash" : form.payment_mode,
      reference: form.reference.trim() || null, amount, tax_amount: tax, expense_date: form.expense_date,
      description: form.description.trim(), receipt_url: form.receipt_url.trim() || null,
    } as any;
    const { error } = form.id ? await supabase.from("expenses").update(payload).eq("id", form.id) : await supabase.from("expenses").insert({ ...payload, tenant_id: undefined });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(form.id ? "Voucher updated" : "Voucher saved as draft");
    setForm(null); refresh();
  }

  async function setStatusFor(e: Expense, next: string) {
    const { error } = await supabase.from("expenses").update({ status: next }).eq("id", e.id);
    if (error) return toast.error(error.message);
    toast.success(`Voucher ${e.voucher_no} ${next}`); refresh();
  }
  async function remove(e: Expense) {
    if (!confirm(`Delete voucher ${e.voucher_no}?`)) return;
    const { error } = await supabase.from("expenses").delete().eq("id", e.id);
    if (error) return toast.error(error.message);
    refresh();
  }

  function printVoucher(e: Expense) {
    const w = window.open("", "_blank", "width=800,height=900");
    if (!w) return toast.error("Allow pop-ups to print");
    w.document.write(`<html><head><title>${esc(e.voucher_no ?? "Voucher")}</title><style>body{font-family:system-ui;padding:40px;color:#111}h1{font-size:20px;margin:0}table{width:100%;border-collapse:collapse;margin:24px 0}td{border:1px solid #ccc;padding:8px}td:first-child{width:35%;background:#f5f5f5;font-weight:600}.sig{display:flex;justify-content:space-between;margin-top:80px}.sig div{border-top:1px solid #333;width:28%;text-align:center;padding-top:6px;font-size:12px}</style></head><body>
      <h1>${e.entry_type === "petty_topup" ? "Petty Cash Receipt" : "Expense Payment Voucher"}</h1>
      <div>${esc(campusName.get(e.campus_id) ?? "")}</div>
      <table>
      <tr><td>Voucher No.</td><td>${esc(e.voucher_no ?? "")}</td></tr>
      <tr><td>Date</td><td>${esc(e.expense_date)}</td></tr>
      <tr><td>Paid to</td><td>${esc(e.payee)}</td></tr>
      <tr><td>Category</td><td>${esc(categoryLabel(e.category))}</td></tr>
      <tr><td>Payment mode</td><td>${esc(modeLabel(e.payment_mode))}${e.reference ? " — " + esc(e.reference) : ""}</td></tr>
      <tr><td>Amount</td><td>${esc(money(e.amount))}</td></tr>
      <tr><td>Tax / deduction</td><td>${esc(money(e.tax_amount))}</td></tr>
      <tr><td>Total</td><td><b>${esc(money(expenseTotal(e)))}</b></td></tr>
      <tr><td>Status</td><td>${esc(e.status.toUpperCase())}</td></tr>
      <tr><td>Description</td><td>${esc(e.description || "—")}</td></tr>
      </table>
      <div class="sig"><div>Prepared by</div><div>Approved by</div><div>Received by</div></div>
      <script>window.onload=()=>window.print()</script></body></html>`);
    w.document.close();
  }

  return (
    <div>
      <PageHeader title="Expenses & Petty Cash" description="Record vouchers, approve and pay them, and keep the petty cash float in check." />
      <div className="mb-4 flex flex-wrap gap-2">
        <Button onClick={() => openNew("expense")}><Plus className="mr-1 h-4 w-4" />New expense</Button>
        <Button variant="outline" onClick={() => openNew("petty_topup")}><Wallet className="mr-1 h-4 w-4" />Add petty cash</Button>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Spent in period", money(spent)],
          ["Pending approval", `${pending.length} · ${money(pending.reduce((s, r) => s + expenseTotal(r), 0))}`],
          ["Paid out", money(outflow)],
          ["Petty cash balance", money(petty)],
        ].map(([k, v]) => (
          <Card key={k} className="shadow-none"><CardContent className="py-4">
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{k}</div>
            <div className={`mt-1 text-lg font-semibold ${k === "Petty cash balance" && petty < 0 ? "text-destructive" : ""}`}>{v}</div>
          </CardContent></Card>
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-end gap-2">
        <div><Label className="text-xs">From</Label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" /></div>
        <div><Label className="text-xs">To</Label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" /></div>
        {isSuper && campuses.length > 1 ? (
          <Select value={campus} onValueChange={setCampus}><SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">All campuses</SelectItem>{campuses.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select>
        ) : null}
        <Select value={category} onValueChange={setCategory}><SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">All categories</SelectItem>{EXPENSE_CATEGORIES.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}</SelectContent></Select>
        <Select value={status} onValueChange={setStatus}><SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>{["all", "draft", "approved", "paid", "rejected"].map((s) => <SelectItem key={s} value={s}>{s === "all" ? "All statuses" : s[0].toUpperCase() + s.slice(1)}</SelectItem>)}</SelectContent></Select>
      </div>

      <Card className="shadow-none"><CardContent className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left text-xs uppercase text-muted-foreground">
            <tr><th className="p-3">Voucher</th><th className="p-3">Date</th><th className="p-3">Paid to</th><th className="p-3">Category</th><th className="p-3">Mode</th><th className="p-3 text-right">Total</th><th className="p-3">Status</th><th className="p-3 text-right">Actions</th></tr>
          </thead>
          <tbody>
            {isLoading ? <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">Loading…</td></tr> :
              visible.length === 0 ? <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">No vouchers in this period.</td></tr> :
              visible.map((e) => (
                <tr key={e.id} className="border-b last:border-0">
                  <td className="p-3 font-mono text-xs">{e.voucher_no}</td>
                  <td className="p-3 whitespace-nowrap">{e.expense_date}</td>
                  <td className="p-3">{e.payee}{e.description ? <div className="text-xs text-muted-foreground line-clamp-1">{e.description}</div> : null}</td>
                  <td className="p-3">{e.entry_type === "petty_topup" ? <Badge variant="outline">Petty cash top-up</Badge> : categoryLabel(e.category)}</td>
                  <td className="p-3">{modeLabel(e.payment_mode)}</td>
                  <td className="p-3 text-right font-medium whitespace-nowrap">{money(expenseTotal(e))}</td>
                  <td className="p-3"><Badge variant={STATUS_VARIANT[e.status]}>{e.status}</Badge></td>
                  <td className="p-3">
                    <div className="flex justify-end gap-1">
                      {e.status === "draft" ? <>
                        <Button size="icon" variant="ghost" title="Approve" onClick={() => setStatusFor(e, "approved")}><Check className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" title="Reject" onClick={() => setStatusFor(e, "rejected")}><X className="h-4 w-4" /></Button>
                      </> : null}
                      {e.status === "approved" ? <Button size="icon" variant="ghost" title="Mark paid" onClick={() => setStatusFor(e, "paid")}><Banknote className="h-4 w-4" /></Button> : null}
                      {e.status !== "paid" ? <Button size="icon" variant="ghost" title="Edit" onClick={() => openEdit(e)}><Pencil className="h-4 w-4" /></Button> : null}
                      {e.status === "draft" || e.status === "rejected" ? <Button size="icon" variant="ghost" title="Delete" onClick={() => remove(e)}><Trash2 className="h-4 w-4" /></Button> : null}
                      <Button size="icon" variant="ghost" title="Print voucher" onClick={() => printVoucher(e)}><Printer className="h-4 w-4" /></Button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </CardContent></Card>

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{form?.id ? "Edit voucher" : form?.entry_type === "petty_topup" ? "Add petty cash" : "New expense voucher"}</DialogTitle></DialogHeader>
          {form ? (
            <div className="grid grid-cols-2 gap-3">
              {campuses.length > 1 ? (
                <div className="col-span-2"><Label>Campus</Label>
                  <Select value={form.campus_id} onValueChange={(v) => setForm({ ...form, campus_id: v })} disabled={!isSuper}><SelectTrigger><SelectValue placeholder="Campus" /></SelectTrigger>
                    <SelectContent>{campuses.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent></Select></div>
              ) : null}
              {form.entry_type === "expense" ? <>
                <div><Label>Category</Label>
                  <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}><SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{EXPENSE_CATEGORIES.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}</SelectContent></Select></div>
                <div><Label>Paid by</Label>
                  <Select value={form.payment_mode} onValueChange={(v) => setForm({ ...form, payment_mode: v })}><SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{PAYMENT_MODES.map((c) => <SelectItem key={c.id} value={c.id}>{c.label}</SelectItem>)}</SelectContent></Select></div>
                <div className="col-span-2"><Label>Paid to (vendor / person)</Label><Input value={form.payee} onChange={(e) => setForm({ ...form, payee: e.target.value })} maxLength={200} /></div>
              </> : null}
              <div><Label>Amount (PKR)</Label><Input type="number" min="0" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
              {form.entry_type === "expense" ? <div><Label>Tax / deduction</Label><Input type="number" min="0" step="0.01" value={form.tax_amount} onChange={(e) => setForm({ ...form, tax_amount: e.target.value })} /></div> : <div />}
              <div><Label>Date</Label><Input type="date" value={form.expense_date} onChange={(e) => setForm({ ...form, expense_date: e.target.value })} /></div>
              <div><Label>Reference / cheque no.</Label><Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} maxLength={100} /></div>
              <div className="col-span-2"><Label>Receipt link</Label><Input placeholder="https://…" value={form.receipt_url} onChange={(e) => setForm({ ...form, receipt_url: e.target.value })} /></div>
              <div className="col-span-2"><Label>Description</Label><Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} maxLength={1000} /></div>
            </div>
          ) : null}
          <DialogFooter><Button variant="outline" onClick={() => setForm(null)}>Cancel</Button><Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
