import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { GOOGLE_FONTS, loadGoogleFont } from "@/lib/google-fonts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Settings2, Building2, Eye } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useTenant, type TenantBranding } from "@/lib/tenant-context";
import { AiUsageTab } from "@/components/platform/ai-usage-tab";
import { BillingTab } from "@/components/platform/billing-tab";
import { FEATURES } from "@/lib/entitlements";
import { Checkbox } from "@/components/ui/checkbox";
import { useServerFn } from "@tanstack/react-start";
import { verifyCustomDomain, type DomainCheck } from "@/lib/domains.functions";
import { TenantSettingsDialog, type TenantSettings } from "@/components/branding/branding-editor";



export const Route = createFileRoute("/_authenticated/platform")({
  component: PlatformPage,
});

type Tenant = {
  id: string;
  name: string;
  slug: string;
  custom_domain: string | null;
  custom_domain_status: string;
  plan_tier_id: string | null;
  status: string;
  created_at: string;
  academic_system: "board" | "cambridge" | "both";
};

type PlanTier = {
  id: string;
  name: string;
  student_limit: number | null;
  campus_limit: number | null;
  staff_limit: number | null;
  ai_message_limit: number | null;
  feature_flags: Record<string, unknown>;
};

type Subscription = {
  id: string;
  tenant_id: string;
  plan_tier_id: string;
  billing_cycle: string;
  status: string;
  current_period_end: string | null;
};

function PlatformPage() {
  const { data: user, isLoading } = useCurrentUser();
  if (isLoading) return null;
  if (!user?.roles.includes("super_admin")) return <Navigate to="/dashboard" />;

  return (
    <div>
      <PageHeader
        title="Platform Admin"
        description="Manage tenants, plans, and subscriptions across the platform."
      />
      <Tabs defaultValue="tenants" className="mt-6">
        <TabsList>
          <TabsTrigger value="tenants">Tenants</TabsTrigger>
          <TabsTrigger value="plans">Plan Tiers</TabsTrigger>
          <TabsTrigger value="subs">Subscriptions</TabsTrigger>
          <TabsTrigger value="billing">Billing</TabsTrigger>
          <TabsTrigger value="ai">AI Usage</TabsTrigger>
        </TabsList>
        <TabsContent value="tenants" className="mt-4"><TenantsTab /></TabsContent>
        <TabsContent value="plans" className="mt-4"><PlansTab /></TabsContent>
        <TabsContent value="subs" className="mt-4"><SubsTab /></TabsContent>
        <TabsContent value="billing" className="mt-4"><BillingTab /></TabsContent>
        <TabsContent value="ai" className="mt-4"><AiUsageTab /></TabsContent>

      </Tabs>
    </div>
  );
}

/* -------------------- Tenants -------------------- */

function TenantsTab() {
  const qc = useQueryClient();
  const { setPreview } = useTenant();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Tenant | null>(null);
  const [settingsFor, setSettingsFor] = useState<Tenant | null>(null);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [domainCheck, setDomainCheck] = useState<DomainCheck | null>(null);
  const verifyDomain = useServerFn(verifyCustomDomain);

  const { data: tenants } = useQuery({
    queryKey: ["platform.tenants"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tenants").select("*").order("created_at");
      if (error) throw error;
      return data as Tenant[];
    },
  });

  const { data: plans } = useQuery({
    queryKey: ["platform.plans"],
    queryFn: async () => {
      const { data, error } = await supabase.from("plan_tiers").select("*").order("name");
      if (error) throw error;
      return data as PlanTier[];
    },
  });

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = {
      name: String(fd.get("name")),
      slug: String(fd.get("slug")).toLowerCase().replace(/[^a-z0-9-]/g, "-"),
      custom_domain: String(fd.get("custom_domain") || "") || null,
      plan_tier_id: String(fd.get("plan_tier_id") || "") || null,
      status: String(fd.get("status") || "active") as "active" | "trial" | "suspended",
      academic_system: String(fd.get("academic_system") || "both") as "board" | "cambridge" | "both",
    };
    const res = editing
      ? await supabase.from("tenants").update(payload).eq("id", editing.id)
      : await supabase.from("tenants").insert(payload).select("id").single();

    if (res.error) return toast.error(res.error.message);
    if (!editing && "data" in res && res.data?.id) {
      // seed tenant_settings row
      await supabase.from("tenant_settings").insert({ tenant_id: res.data.id });
    }
    toast.success(editing ? "Tenant updated" : "Tenant created");
    setOpen(false);
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["platform.tenants"] });
  }

  async function handleDelete(t: Tenant) {
    if (t.slug === "educore") return toast.error("Cannot delete the default tenant.");
    if (!confirm(`Delete tenant "${t.name}"? All associated data will be removed.`)) return;
    const { error } = await supabase.from("tenants").delete().eq("id", t.id);
    if (error) return toast.error(error.message);
    toast.success("Tenant deleted");
    qc.invalidateQueries({ queryKey: ["platform.tenants"] });
  }

  async function startPreview(t: Tenant) {
    const { data, error } = await supabase
      .from("tenant_settings")
      .select("*")
      .eq("tenant_id", t.id)
      .maybeSingle();
    if (error) return toast.error(error.message);
    const s = data as TenantSettings | null;
    setPreview({
      id: t.id,
      name: t.name,
      slug: t.slug,
      status: t.status,
      custom_domain: t.custom_domain,
      logo_url: s?.logo_url ?? null,
      favicon_url: s?.favicon_url ?? null,
      primary_color: s?.primary_color ?? null,
      secondary_color: s?.secondary_color ?? null,
      accent_color: s?.accent_color ?? null,
      font: s?.font ?? null,
      letterhead_url: s?.letterhead_url ?? null,
      signature_url: s?.signature_url ?? null,
      email_sender_name: s?.email_sender_name ?? null,
      default_currency: s?.default_currency ?? "USD",
      default_timezone: s?.default_timezone ?? "UTC",
      academic_system: t.academic_system ?? "both",
      plan_name: plans?.find((p) => p.id === t.plan_tier_id)?.name ?? null,
      feature_flags: (plans?.find((p) => p.id === t.plan_tier_id)?.feature_flags ?? null) as Record<string, boolean> | null,
      student_limit: plans?.find((p) => p.id === t.plan_tier_id)?.student_limit ?? null,
      campus_limit: plans?.find((p) => p.id === t.plan_tier_id)?.campus_limit ?? null,
      staff_limit: plans?.find((p) => p.id === t.plan_tier_id)?.staff_limit ?? null,
      ai_message_limit: plans?.find((p) => p.id === t.plan_tier_id)?.ai_message_limit ?? null,
    } satisfies TenantBranding);
    toast.success(`Previewing ${t.name}`);
  }



  function planName(id: string | null) {
    return plans?.find((p) => p.id === id)?.name ?? "—";
  }

  async function runVerify(tenantId: string) {
    setVerifyingId(tenantId);
    try {
      const result = await verifyDomain({ data: { tenantId } });
      setDomainCheck(result);
      if (result.status === "verified") toast.success(result.message);
      else toast.message(result.message);
      qc.invalidateQueries({ queryKey: ["platform.tenants"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not check the domain");
    } finally {
      setVerifyingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" /> New Tenant
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Slug</TableHead>
                  <TableHead>Custom Domain</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tenants?.map((t) => (
                  <TableRow key={t.id}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell><code className="text-xs">{t.slug}</code></TableCell>
                    <TableCell className="text-xs">
                      {t.custom_domain ?? <span className="opacity-50">—</span>}
                      {t.custom_domain && (
                        <>
                          <Badge variant="outline" className="ml-2">{t.custom_domain_status}</Badge>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="ml-1 h-6 px-2 text-xs"
                            disabled={verifyingId === t.id}
                            onClick={() => runVerify(t.id)}
                          >
                            {verifyingId === t.id ? "Checking…" : "Verify"}
                          </Button>
                        </>
                      )}
                    </TableCell>
                    <TableCell>{planName(t.plan_tier_id)}</TableCell>
                    <TableCell>
                      <Badge variant={t.status === "active" ? "default" : "secondary"}>{t.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        aria-label={`Preview ${t.name} interface`}
                        title="Preview this tenant's interface & font"
                        onClick={() => startPreview(t)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setSettingsFor(t)}>
                        <Settings2 className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setEditing(t); setOpen(true); }}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(t)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>

                  </TableRow>
                ))}
                {!tenants?.length && (
                  <TableRow><TableCell colSpan={6} className="text-center py-8 opacity-60">No tenants yet.</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={!!domainCheck} onOpenChange={(o) => !o && setDomainCheck(null)}>
        <DialogContent className="max-w-lg w-[95vw]">
          <DialogHeader>
            <DialogTitle>Domain setup — {domainCheck?.domain}</DialogTitle>
          </DialogHeader>
          {domainCheck && (
            <div className="space-y-3 text-sm">
              <p>
                Status:{" "}
                <Badge variant={domainCheck.status === "verified" ? "default" : "secondary"}>
                  {domainCheck.status}
                </Badge>
              </p>
              <p className="text-muted-foreground">{domainCheck.message}</p>
              <div className="rounded-md border p-3 space-y-1 text-xs">
                <div><span className="text-muted-foreground">Type:</span> <code>{domainCheck.recordType}</code></div>
                <div><span className="text-muted-foreground">Name:</span> <code>{domainCheck.recordName}</code></div>
                <div className="break-all"><span className="text-muted-foreground">Value:</span> <code>{domainCheck.recordValue}</code></div>
              </div>
              {domainCheck.found.length > 0 && (
                <div className="text-xs text-muted-foreground break-all">
                  Currently published: {domainCheck.found.join(", ")}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDomainCheck(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Tenant" : "New Tenant"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="name">Institution Name</Label>
              <Input id="name" name="name" defaultValue={editing?.name ?? ""} required />
            </div>
            <div>
              <Label htmlFor="slug">Slug (subdomain)</Label>
              <Input id="slug" name="slug" defaultValue={editing?.slug ?? ""} required
                placeholder="e.g. greenvalley → greenvalley.yourapp.com" />
            </div>
            <div>
              <Label htmlFor="custom_domain">Custom Domain (optional)</Label>
              <Input id="custom_domain" name="custom_domain" defaultValue={editing?.custom_domain ?? ""}
                placeholder="portal.yourschool.edu" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Plan</Label>
                <Select name="plan_tier_id" defaultValue={editing?.plan_tier_id ?? undefined}>
                  <SelectTrigger><SelectValue placeholder="Select plan" /></SelectTrigger>
                  <SelectContent>
                    {plans?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select name="status" defaultValue={editing?.status ?? "active"}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="trial">Trial</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                    
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Examination system</Label>
              <Select name="academic_system" defaultValue={editing?.academic_system ?? "both"}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="board">BISE Board only</SelectItem>
                  <SelectItem value="cambridge">Cambridge only</SelectItem>
                  <SelectItem value="both">Board &amp; Cambridge</SelectItem>
                </SelectContent>
              </Select>
              <p className="mt-1 text-xs text-muted-foreground">
                Chosen when the institution buys a plan. Narrowing it later only hides the module — existing records are kept.
              </p>
            </div>
            <DialogFooter>
              <Button type="submit">{editing ? "Save" : "Create"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {settingsFor && (
        <TenantSettingsDialog tenant={settingsFor} onClose={() => setSettingsFor(null)} />
      )}
    </div>
  );
}

/* -------------------- Plan Tiers -------------------- */

function PlansTab() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PlanTier | null>(null);

  const { data: plans } = useQuery({
    queryKey: ["platform.plans"],
    queryFn: async () => {
      const { data, error } = await supabase.from("plan_tiers").select("*").order("name");
      if (error) throw error;
      return data as PlanTier[];
    },
  });

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const flags: Record<string, boolean> = {};
    for (const f of FEATURES) flags[f.key] = fd.get(`feat.${f.key}`) === "on";
    const payload = {
      name: String(fd.get("name")),
      student_limit: fd.get("student_limit") ? Number(fd.get("student_limit")) : null,
      campus_limit: fd.get("campus_limit") ? Number(fd.get("campus_limit")) : null,
      staff_limit: fd.get("staff_limit") ? Number(fd.get("staff_limit")) : null,
      ai_message_limit: fd.get("ai_message_limit") ? Number(fd.get("ai_message_limit")) : null,
      feature_flags: flags as never,
    };
    const res = editing
      ? await supabase.from("plan_tiers").update(payload).eq("id", editing.id)
      : await supabase.from("plan_tiers").insert(payload);
    if (res.error) return toast.error(res.error.message);
    toast.success(editing ? "Plan updated" : "Plan created");
    setOpen(false);
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["platform.plans"] });
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this plan tier?")) return;
    const { error } = await supabase.from("plan_tiers").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Plan deleted");
    qc.invalidateQueries({ queryKey: ["platform.plans"] });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" /> New Plan
        </Button>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Student Limit</TableHead>
                <TableHead>Campus Limit</TableHead>
                <TableHead>Features</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plans?.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>{p.student_limit ?? "Unlimited"}</TableCell>
                  <TableCell>{p.campus_limit ?? "Unlimited"}</TableCell>
                  <TableCell className="text-xs opacity-70 max-w-xs truncate">
                    {Object.keys(p.feature_flags ?? {}).join(", ") || "—"}
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button size="sm" variant="ghost" onClick={() => { setEditing(p); setOpen(true); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(p.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg w-[95vw]">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Plan" : "New Plan"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="name">Name</Label>
              <Input id="name" name="name" defaultValue={editing?.name ?? ""} required />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="student_limit">Student Limit</Label>
                <Input id="student_limit" name="student_limit" type="number" defaultValue={editing?.student_limit ?? ""} placeholder="Blank = unlimited" />
              </div>
              <div>
                <Label htmlFor="campus_limit">Campus Limit</Label>
                <Input id="campus_limit" name="campus_limit" type="number" defaultValue={editing?.campus_limit ?? ""} placeholder="Blank = unlimited" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label htmlFor="staff_limit">Staff Limit</Label>
                <Input id="staff_limit" name="staff_limit" type="number" defaultValue={editing?.staff_limit ?? ""} placeholder="Blank = unlimited" />
              </div>
              <div>
                <Label htmlFor="ai_message_limit">AI messages / month</Label>
                <Input id="ai_message_limit" name="ai_message_limit" type="number" defaultValue={editing?.ai_message_limit ?? ""} placeholder="Blank = unlimited" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Included features</Label>
              <div className="grid max-h-56 grid-cols-1 gap-2 overflow-y-auto rounded-sm border p-3 sm:grid-cols-2">
                {FEATURES.map((f) => (
                  <label key={f.key} className="flex items-start gap-2 text-sm">
                    <Checkbox
                      name={`feat.${f.key}`}
                      defaultChecked={(editing?.feature_flags?.[f.key] ?? true) !== false}
                    />
                    <span>{f.label}</span>
                  </label>
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button type="submit">{editing ? "Save" : "Create"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* -------------------- Subscriptions -------------------- */

function SubsTab() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Subscription | null>(null);

  const { data: subs } = useQuery({
    queryKey: ["platform.subs"],
    queryFn: async () => {
      const { data, error } = await supabase.from("subscriptions").select("*").order("created_at");
      if (error) throw error;
      return data as Subscription[];
    },
  });
  const { data: tenants } = useQuery({
    queryKey: ["platform.tenants"],
    queryFn: async () => {
      const { data, error } = await supabase.from("tenants").select("id,name").order("name");
      if (error) throw error;
      return data as { id: string; name: string }[];
    },
  });
  const { data: plans } = useQuery({
    queryKey: ["platform.plans"],
    queryFn: async () => {
      const { data, error } = await supabase.from("plan_tiers").select("id,name").order("name");
      if (error) throw error;
      return data as { id: string; name: string }[];
    },
  });

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const periodEnd = String(fd.get("current_period_end") || "");
    const payload = {
      tenant_id: String(fd.get("tenant_id")),
      plan_tier_id: String(fd.get("plan_tier_id")),
      billing_cycle: String(fd.get("billing_cycle")) as "monthly" | "yearly",
      status: String(fd.get("status")) as "active" | "trialing" | "past_due" | "canceled",
      current_period_end: periodEnd ? new Date(periodEnd).toISOString() : null,
    };

    const res = editing
      ? await supabase.from("subscriptions").update(payload).eq("id", editing.id)
      : await supabase.from("subscriptions").insert(payload);
    if (res.error) return toast.error(res.error.message);
    toast.success(editing ? "Subscription updated" : "Subscription created");
    setOpen(false);
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["platform.subs"] });
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this subscription?")) return;
    const { error } = await supabase.from("subscriptions").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Subscription deleted");
    qc.invalidateQueries({ queryKey: ["platform.subs"] });
  }

  const tenantName = (id: string) => tenants?.find((t) => t.id === id)?.name ?? id;
  const planName = (id: string) => plans?.find((p) => p.id === id)?.name ?? id;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => { setEditing(null); setOpen(true); }}>
          <Plus className="mr-2 h-4 w-4" /> New Subscription
        </Button>
      </div>
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tenant</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Cycle</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Period End</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {subs?.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>{tenantName(s.tenant_id)}</TableCell>
                  <TableCell>{planName(s.plan_tier_id)}</TableCell>
                  <TableCell>{s.billing_cycle}</TableCell>
                  <TableCell><Badge>{s.status}</Badge></TableCell>
                  <TableCell className="text-xs">{s.current_period_end ? new Date(s.current_period_end).toLocaleDateString() : "—"}</TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button size="sm" variant="ghost" onClick={() => { setEditing(s); setOpen(true); }}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(s.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {!subs?.length && (
                <TableRow><TableCell colSpan={6} className="text-center py-8 opacity-60">No subscriptions yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg w-[95vw]">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Subscription" : "New Subscription"}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label>Tenant</Label>
              <Select name="tenant_id" defaultValue={editing?.tenant_id} required>
                <SelectTrigger><SelectValue placeholder="Select tenant" /></SelectTrigger>
                <SelectContent>
                  {tenants?.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Plan</Label>
              <Select name="plan_tier_id" defaultValue={editing?.plan_tier_id} required>
                <SelectTrigger><SelectValue placeholder="Select plan" /></SelectTrigger>
                <SelectContent>
                  {plans?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Billing Cycle</Label>
                <Select name="billing_cycle" defaultValue={editing?.billing_cycle ?? "monthly"}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="yearly">Yearly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select name="status" defaultValue={editing?.status ?? "active"}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="trialing">Trialing</SelectItem>
                    <SelectItem value="past_due">Past Due</SelectItem>
                    <SelectItem value="canceled">Canceled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="current_period_end">Current Period End</Label>
              <Input id="current_period_end" name="current_period_end" type="date"
                defaultValue={editing?.current_period_end ? editing.current_period_end.slice(0, 10) : ""} />
            </div>
            <DialogFooter>
              <Button type="submit">{editing ? "Save" : "Create"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
