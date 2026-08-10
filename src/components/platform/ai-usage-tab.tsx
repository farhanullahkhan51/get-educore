import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Settings2 } from "lucide-react";

type TenantRow = { id: string; name: string };
type UsageRow = { tenant_id: string; requests: number; cost_usd: number | string; feature: string };
type LimitRow = {
  tenant_id: string;
  monthly_request_cap: number | null;
  monthly_cost_cap_usd: number | string | null;
  enabled: boolean;
};

function monthStart() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

const money = (n: number) => `$${n.toFixed(2)}`;

export function AiUsageTab() {
  const [editing, setEditing] = useState<{ tenant: TenantRow; limit: LimitRow | null } | null>(null);

  const { data: tenants = [] } = useQuery({
    queryKey: ["platform", "tenants", "min"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tenants").select("id, name").order("name");
      if (error) throw error;
      return (data ?? []) as TenantRow[];
    },
  });

  const { data: usage = [] } = useQuery({
    queryKey: ["ai-usage", "month"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_usage")
        .select("tenant_id, requests, cost_usd, feature")
        .gte("usage_date", monthStart());
      if (error) throw error;
      return (data ?? []) as UsageRow[];
    },
  });

  const { data: limits = [] } = useQuery({
    queryKey: ["ai-usage-limits"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ai_usage_limits")
        .select("tenant_id, monthly_request_cap, monthly_cost_cap_usd, enabled");
      if (error) throw error;
      return (data ?? []) as LimitRow[];
    },
  });

  const byTenant = useMemo(() => {
    const map = new Map<string, { requests: number; cost: number; voice: number }>();
    for (const row of usage) {
      const entry = map.get(row.tenant_id) ?? { requests: 0, cost: 0, voice: 0 };
      entry.requests += row.requests ?? 0;
      entry.cost += Number(row.cost_usd ?? 0);
      if (row.feature === "voice") entry.voice += row.requests ?? 0;
      map.set(row.tenant_id, entry);
    }
    return map;
  }, [usage]);

  const totals = useMemo(
    () =>
      Array.from(byTenant.values()).reduce(
        (acc, v) => ({ requests: acc.requests + v.requests, cost: acc.cost + v.cost }),
        { requests: 0, cost: 0 },
      ),
    [byTenant],
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Requests this month</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{totals.requests.toLocaleString()}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Estimated cost</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{money(totals.cost)}</CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Institutions with caps</CardTitle></CardHeader>
          <CardContent className="text-2xl font-semibold">{limits.filter((l) => l.enabled).length}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>AI usage by institution</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Institution</TableHead>
                <TableHead className="text-right">Requests</TableHead>
                <TableHead className="text-right">Voice</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead>Allowance</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {tenants.map((tenant) => {
                const stats = byTenant.get(tenant.id) ?? { requests: 0, cost: 0, voice: 0 };
                const limit = limits.find((l) => l.tenant_id === tenant.id) ?? null;
                const reqCap = limit?.monthly_request_cap ?? null;
                const costCap = limit?.monthly_cost_cap_usd === null || limit?.monthly_cost_cap_usd === undefined
                  ? null
                  : Number(limit.monthly_cost_cap_usd);
                const ratio = Math.max(
                  reqCap ? stats.requests / reqCap : 0,
                  costCap ? stats.cost / costCap : 0,
                );
                const active = limit?.enabled !== false && (reqCap || costCap);
                return (
                  <TableRow key={tenant.id}>
                    <TableCell className="font-medium">{tenant.name}</TableCell>
                    <TableCell className="text-right">{stats.requests.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{stats.voice.toLocaleString()}</TableCell>
                    <TableCell className="text-right">{money(stats.cost)}</TableCell>
                    <TableCell>
                      {!active ? (
                        <Badge variant="outline">Unlimited</Badge>
                      ) : (
                        <Badge variant={ratio >= 1 ? "destructive" : ratio >= 0.8 ? "secondary" : "outline"}>
                          {reqCap ? `${stats.requests}/${reqCap} req` : ""}
                          {reqCap && costCap ? " · " : ""}
                          {costCap ? `${money(stats.cost)}/${money(costCap)}` : ""}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button variant="ghost" size="icon" onClick={() => setEditing({ tenant, limit })}>
                        <Settings2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {tenants.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-muted-foreground">No institutions yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {editing && (
        <LimitDialog
          tenant={editing.tenant}
          limit={editing.limit}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function LimitDialog({
  tenant,
  limit,
  onClose,
}: {
  tenant: TenantRow;
  limit: LimitRow | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [enabled, setEnabled] = useState(limit?.enabled ?? true);
  const [requestCap, setRequestCap] = useState(limit?.monthly_request_cap?.toString() ?? "");
  const [costCap, setCostCap] = useState(
    limit?.monthly_cost_cap_usd === null || limit?.monthly_cost_cap_usd === undefined
      ? ""
      : String(limit.monthly_cost_cap_usd),
  );
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("ai_usage_limits").upsert(
      {
        tenant_id: tenant.id,
        enabled,
        monthly_request_cap: requestCap.trim() === "" ? null : Number(requestCap),
        monthly_cost_cap_usd: costCap.trim() === "" ? null : Number(costCap),
      },
      { onConflict: "tenant_id" },
    );
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Allowance updated");
    void qc.invalidateQueries({ queryKey: ["ai-usage-limits"] });
    onClose();
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>AI allowance — {tenant.name}</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">Enforce allowance</p>
              <p className="text-xs text-muted-foreground">Block assistant requests once a cap is reached.</p>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="req-cap">Monthly request cap</Label>
            <Input
              id="req-cap"
              inputMode="numeric"
              placeholder="Leave blank for unlimited"
              value={requestCap}
              onChange={(e) => setRequestCap(e.target.value.replace(/[^0-9]/g, ""))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cost-cap">Monthly cost cap (USD)</Label>
            <Input
              id="cost-cap"
              inputMode="decimal"
              placeholder="Leave blank for unlimited"
              value={costCap}
              onChange={(e) => setCostCap(e.target.value.replace(/[^0-9.]/g, ""))}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
