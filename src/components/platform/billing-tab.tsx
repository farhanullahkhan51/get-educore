import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { currency as fmt } from "@/lib/billing";
import { markInvoicePaid, extendTrial } from "@/lib/billing.functions";

type Row = {
  id: string;
  invoice_no: string;
  tenant_id: string;
  amount: number;
  currency: string;
  billing_cycle: string;
  status: string;
  reference: string | null;
  proof_url: string | null;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
};

type TenantRow = { id: string; name: string; status: string };

/** Platform-owner view: confirm bank transfers and extend trials. */
export function BillingTab() {
  const qc = useQueryClient();
  const confirmPaid = useServerFn(markInvoicePaid);
  const addDays = useServerFn(extendTrial);
  const [days, setDays] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const { data: invoices } = useQuery({
    queryKey: ["platform.invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Row[];
    },
  });

  const { data: tenants } = useQuery({
    queryKey: ["platform.tenants.billing"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tenants").select("id, name, status").order("name");
      if (error) throw error;
      return data as TenantRow[];
    },
  });

  const tenantName = (id: string) => tenants?.find((t) => t.id === id)?.name ?? id.slice(0, 8);

  async function handleConfirm(id: string) {
    setBusy(id);
    try {
      await confirmPaid({ data: { invoice_id: id } });
      toast.success("Payment confirmed — institution activated.");
      qc.invalidateQueries({ queryKey: ["platform.invoices"] });
      qc.invalidateQueries({ queryKey: ["platform.tenants.billing"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not confirm");
    } finally {
      setBusy(null);
    }
  }

  async function handleExtend(tenantId: string) {
    const n = Number(days[tenantId] ?? 0);
    if (!n || n < 1) return toast.error("Enter the number of days");
    setBusy(tenantId);
    try {
      await addDays({ data: { tenant_id: tenantId, days: n } });
      toast.success(`Trial extended by ${n} days.`);
      qc.invalidateQueries({ queryKey: ["platform.tenants.billing"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not extend trial");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="font-serif text-lg">Bank transfer invoices</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Invoice</TableHead>
                <TableHead>Institution</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(invoices ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-sm text-muted-foreground">
                    No invoices yet.
                  </TableCell>
                </TableRow>
              )}
              {(invoices ?? []).map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="font-mono text-xs">{inv.invoice_no}</TableCell>
                  <TableCell>{tenantName(inv.tenant_id)}</TableCell>
                  <TableCell>{fmt(Number(inv.amount), inv.currency)}</TableCell>
                  <TableCell className="text-xs">
                    {inv.reference ?? <span className="text-muted-foreground">—</span>}
                    {inv.proof_url && (
                      <a href={inv.proof_url} target="_blank" rel="noreferrer" className="ml-2 underline">
                        receipt
                      </a>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={inv.status === "paid" ? "outline" : "secondary"}>{inv.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    {inv.status !== "paid" && (
                      <Button size="sm" disabled={busy === inv.id} onClick={() => handleConfirm(inv.id)}>
                        Mark paid
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="font-serif text-lg">Trials</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {(tenants ?? []).map((t) => (
            <div key={t.id} className="flex flex-wrap items-center gap-3 rounded-sm border p-3">
              <div className="flex-1 min-w-40">
                <div className="text-sm font-medium">{t.name}</div>
                <Badge variant="outline" className="mt-1">{t.status}</Badge>
              </div>
              <Input
                type="number"
                min={1}
                max={120}
                placeholder="Days"
                className="w-24"
                value={days[t.id] ?? ""}
                onChange={(e) => setDays((d) => ({ ...d, [t.id]: e.target.value }))}
              />
              <Button size="sm" variant="outline" disabled={busy === t.id} onClick={() => handleExtend(t.id)}>
                Extend trial
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
