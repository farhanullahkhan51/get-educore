import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Building2, CreditCard, Landmark } from "lucide-react";
import { useBilling, currency as fmt } from "@/lib/billing";
import { requestBankTransferInvoice, submitPaymentProof } from "@/lib/billing.functions";

export const Route = createFileRoute("/_authenticated/billing")({
  head: () => ({
    meta: [
      { title: "Billing & Plan — EduCore" },
      { name: "description", content: "Manage your institution's plan, trial, invoices and payment method." },
      { property: "og:title", content: "Billing & Plan — EduCore" },
      { property: "og:description", content: "Plan, trial status, invoices and payments for your institution." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BillingPage,
});

type Plan = {
  id: string;
  name: string;
  description: string | null;
  price_monthly_pkr: number | null;
  price_yearly_pkr: number | null;
  price_monthly_usd: number | null;
  price_yearly_usd: number | null;
};

type Invoice = {
  id: string;
  invoice_no: string;
  amount: number;
  currency: string;
  billing_cycle: string;
  status: string;
  period_start: string | null;
  period_end: string | null;
  reference: string | null;
  created_at: string;
};

function BillingPage() {
  const qc = useQueryClient();
  const { state, isTrial, daysLeft, readOnly } = useBilling();
  const requestInvoice = useServerFn(requestBankTransferInvoice);
  const sendProof = useServerFn(submitPaymentProof);

  const [cycle, setCycle] = useState<"monthly" | "yearly">("monthly");
  const [curr, setCurr] = useState<"PKR" | "USD">("PKR");
  const [proofOpen, setProofOpen] = useState<Invoice | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: plans } = useQuery({
    queryKey: ["billing.plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plan_tiers")
        .select("id, name, description, price_monthly_pkr, price_yearly_pkr, price_monthly_usd, price_yearly_usd")
        .eq("is_public", true)
        .order("sort_order");
      if (error) throw error;
      return data as Plan[];
    },
  });

  const { data: invoices } = useQuery({
    queryKey: ["billing.invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, invoice_no, amount, currency, billing_cycle, status, period_start, period_end, reference, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Invoice[];
    },
  });

  const price = (p: Plan) =>
    curr === "PKR"
      ? cycle === "yearly" ? p.price_yearly_pkr : p.price_monthly_pkr
      : cycle === "yearly" ? p.price_yearly_usd : p.price_monthly_usd;

  async function choosePlan(planId: string) {
    setBusy(true);
    try {
      await requestInvoice({ data: { plan_tier_id: planId, billing_cycle: cycle, currency: curr } });
      toast.success("Invoice issued — transfer the amount and add your reference below.");
      qc.invalidateQueries({ queryKey: ["billing.invoices"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not issue the invoice");
    } finally {
      setBusy(false);
    }
  }

  async function handleProof(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!proofOpen) return;
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    try {
      await sendProof({
        data: {
          invoice_id: proofOpen.id,
          reference: String(fd.get("reference")),
          proof_url: String(fd.get("proof_url") || ""),
        },
      });
      toast.success("Payment details submitted — we will confirm shortly.");
      setProofOpen(null);
      qc.invalidateQueries({ queryKey: ["billing.invoices"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not submit");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AppShell>
      <PageHeader title="Billing & Plan" description="Your subscription, invoices and payment method." />

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Current plan</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-serif text-2xl">{state?.plan_name ?? "No plan"}</div>
            <Badge variant={readOnly ? "destructive" : "outline"} className="mt-2">
              {readOnly ? "Read-only" : (state?.subscription_status ?? state?.tenant_status ?? "—")}
            </Badge>
          </CardContent>
        </Card>
        <Card className="shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {isTrial ? "Trial ends in" : "Renews in"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="font-serif text-2xl">
              {daysLeft == null ? "—" : `${daysLeft} day${daysLeft === 1 ? "" : "s"}`}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {isTrial
                ? "Pick a plan before the trial ends to keep adding records."
                : "We will remind you before the period ends."}
            </p>
          </CardContent>
        </Card>
        <Card className="shadow-none">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Payment method</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="flex items-center gap-2">
              <Landmark className="h-4 w-4" /> Bank transfer — available now
            </div>
            <div className="flex items-center gap-2 text-muted-foreground">
              <CreditCard className="h-4 w-4" /> Card checkout — coming soon
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6 shadow-none">
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0">
          <CardTitle className="font-serif text-lg">Choose a plan</CardTitle>
          <div className="flex gap-2">
            <Select value={cycle} onValueChange={(v) => setCycle(v as typeof cycle)}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="yearly">Yearly</SelectItem>
              </SelectContent>
            </Select>
            <Select value={curr} onValueChange={(v) => setCurr(v as typeof curr)}>
              <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PKR">PKR</SelectItem>
                <SelectItem value="USD">USD</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-3">
          {(plans ?? []).map((p) => (
            <div key={p.id} className="rounded-sm border p-4">
              <div className="font-serif text-xl">{p.name}</div>
              <p className="mt-1 min-h-10 text-xs text-muted-foreground">{p.description}</p>
              <div className="mt-3 font-serif text-2xl">
                {price(p) == null ? "—" : fmt(price(p)!, curr)}
                <span className="text-sm text-muted-foreground"> / {cycle === "yearly" ? "yr" : "mo"}</span>
              </div>
              <Button
                className="mt-4 w-full"
                variant={state?.plan_name === p.name ? "outline" : "default"}
                disabled={busy}
                onClick={() => choosePlan(p.id)}
              >
                <Building2 className="mr-2 h-4 w-4" /> Pay by bank transfer
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="mt-6 shadow-none">
        <CardHeader>
          <CardTitle className="font-serif text-lg">Invoices</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Period</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(invoices ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-sm text-muted-foreground">
                    No invoices yet.
                  </TableCell>
                </TableRow>
              )}
              {(invoices ?? []).map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-mono text-xs">{inv.invoice_no}</TableCell>
                  <TableCell className="text-xs">
                    {inv.period_start} → {inv.period_end}
                  </TableCell>
                  <TableCell>{fmt(Number(inv.amount), inv.currency)}</TableCell>
                  <TableCell>
                    <Badge variant={inv.status === "paid" ? "outline" : "secondary"}>{inv.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {inv.status === "pending" && (
                      <Button size="sm" variant="outline" onClick={() => setProofOpen(inv)}>
                        {inv.reference ? "Update payment details" : "I have paid"}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!proofOpen} onOpenChange={(o) => !o && setProofOpen(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-serif">Confirm your bank transfer</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleProof} className="space-y-4">
            <div className="rounded-sm border bg-muted/40 p-3 text-xs">
              Transfer {proofOpen ? fmt(Number(proofOpen.amount), proofOpen.currency) : ""} to the
              account on your invoice, then enter the transaction reference below. Your plan
              activates as soon as we confirm receipt.
            </div>
            <div className="space-y-2">
              <Label htmlFor="reference">Transaction reference</Label>
              <Input id="reference" name="reference" required minLength={3} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="proof_url">Receipt link (optional)</Label>
              <Input id="proof_url" name="proof_url" type="url" placeholder="https://…" />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              Submit payment details
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
