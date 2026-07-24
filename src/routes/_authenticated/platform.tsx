import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Settings2, Building2 } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";

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
};

type PlanTier = {
  id: string;
  name: string;
  student_limit: number | null;
  campus_limit: number | null;
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
        </TabsList>
        <TabsContent value="tenants" className="mt-4"><TenantsTab /></TabsContent>
        <TabsContent value="plans" className="mt-4"><PlansTab /></TabsContent>
        <TabsContent value="subs" className="mt-4"><SubsTab /></TabsContent>
      </Tabs>
    </div>
  );
}

/* -------------------- Tenants -------------------- */

function TenantsTab() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Tenant | null>(null);
  const [settingsFor, setSettingsFor] = useState<Tenant | null>(null);

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

  function planName(id: string | null) {
    return plans?.find((p) => p.id === id)?.name ?? "—";
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
                        <Badge variant="outline" className="ml-2">{t.custom_domain_status}</Badge>
                      )}
                    </TableCell>
                    <TableCell>{planName(t.plan_tier_id)}</TableCell>
                    <TableCell>
                      <Badge variant={t.status === "active" ? "default" : "secondary"}>{t.status}</Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-1">
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
                    <SelectItem value="archived">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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

/* -------------------- Tenant Settings -------------------- */

type TenantSettings = {
  tenant_id: string;
  logo_url: string | null;
  favicon_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  accent_color: string | null;
  font: string | null;
  letterhead_url: string | null;
  signature_url: string | null;
  email_sender_name: string | null;
  default_currency: string;
  default_timezone: string;
};

function TenantSettingsDialog({ tenant, onClose }: { tenant: Tenant; onClose: () => void }) {
  const qc = useQueryClient();
  const { data: settings, isLoading } = useQuery({
    queryKey: ["platform.settings", tenant.id],
    queryFn: async () => {
      const { data, error } = await supabase.from("tenant_settings").select("*").eq("tenant_id", tenant.id).maybeSingle();
      if (error) throw error;
      return data as TenantSettings | null;
    },
  });

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const payload = {
      tenant_id: tenant.id,
      logo_url: String(fd.get("logo_url") || "") || null,
      favicon_url: String(fd.get("favicon_url") || "") || null,
      primary_color: String(fd.get("primary_color") || "") || null,
      secondary_color: String(fd.get("secondary_color") || "") || null,
      accent_color: String(fd.get("accent_color") || "") || null,
      font: String(fd.get("font") || "") || null,
      letterhead_url: String(fd.get("letterhead_url") || "") || null,
      signature_url: String(fd.get("signature_url") || "") || null,
      email_sender_name: String(fd.get("email_sender_name") || "") || null,
      default_currency: String(fd.get("default_currency") || "USD"),
      default_timezone: String(fd.get("default_timezone") || "UTC"),
    };
    const { error } = await supabase.from("tenant_settings").upsert(payload, { onConflict: "tenant_id" });
    if (error) return toast.error(error.message);
    toast.success("Settings saved");
    qc.invalidateQueries({ queryKey: ["platform.settings", tenant.id] });
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{tenant.name} — Branding & Settings</DialogTitle>
        </DialogHeader>
        {isLoading ? <div className="opacity-60">Loading…</div> : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field name="logo_url" label="Logo URL" defaultValue={settings?.logo_url} />
              <Field name="favicon_url" label="Favicon URL" defaultValue={settings?.favicon_url} />
              <Field name="primary_color" label="Primary Color (hex)" defaultValue={settings?.primary_color} placeholder="#0f172a" />
              <Field name="secondary_color" label="Secondary Color" defaultValue={settings?.secondary_color} placeholder="#475569" />
              <Field name="accent_color" label="Accent Color" defaultValue={settings?.accent_color} placeholder="#c9a24a" />
              <Field name="font" label="Font Family" defaultValue={settings?.font} placeholder="Inter" />
              <Field name="letterhead_url" label="Letterhead URL" defaultValue={settings?.letterhead_url} />
              <Field name="signature_url" label="Signature URL" defaultValue={settings?.signature_url} />
              <Field name="email_sender_name" label="Email Sender Name" defaultValue={settings?.email_sender_name} />
              <Field name="default_currency" label="Default Currency" defaultValue={settings?.default_currency ?? "USD"} />
              <Field name="default_timezone" label="Default Timezone" defaultValue={settings?.default_timezone ?? "UTC"} />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
              <Button type="submit">Save Settings</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Field({ name, label, defaultValue, placeholder }: {
  name: string; label: string; defaultValue?: string | null; placeholder?: string;
}) {
  return (
    <div>
      <Label htmlFor={name}>{label}</Label>
      <Input id={name} name={name} defaultValue={defaultValue ?? ""} placeholder={placeholder} />
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
    let flags: Record<string, unknown> = {};
    try {
      const raw = String(fd.get("feature_flags") || "").trim();
      if (raw) flags = JSON.parse(raw);
    } catch {
      return toast.error("Feature flags must be valid JSON.");
    }
    const payload = {
      name: String(fd.get("name")),
      student_limit: fd.get("student_limit") ? Number(fd.get("student_limit")) : null,
      campus_limit: fd.get("campus_limit") ? Number(fd.get("campus_limit")) : null,
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
            <div>
              <Label htmlFor="feature_flags">Feature Flags (JSON)</Label>
              <Textarea id="feature_flags" name="feature_flags" rows={4}
                defaultValue={editing ? JSON.stringify(editing.feature_flags ?? {}, null, 2) : `{\n  "board": true,\n  "cambridge": true\n}`} />
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
      billing_cycle: String(fd.get("billing_cycle")),
      status: String(fd.get("status")),
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
                    <SelectItem value="annual">Annual</SelectItem>
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
