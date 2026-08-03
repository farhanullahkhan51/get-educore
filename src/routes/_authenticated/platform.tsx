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
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Settings2, Building2, Eye } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useTenant, type TenantBranding } from "@/lib/tenant-context";


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
  const { setPreview } = useTenant();

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
    } satisfies TenantBranding);
    toast.success(`Previewing ${t.name}`);
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

  if (isLoading) {
    return (
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-2xl w-[95vw]"><div className="opacity-60 p-6">Loading…</div></DialogContent>
      </Dialog>
    );
  }

  return (
    <SettingsForm tenant={tenant} settings={settings ?? null} onClose={onClose} onSaved={() => {
      qc.invalidateQueries({ queryKey: ["platform.settings", tenant.id] });
      qc.invalidateQueries({ queryKey: ["tenant-branding"] });
    }} />
  );
}

function SettingsForm({
  tenant, settings, onClose, onSaved,
}: {
  tenant: Tenant;
  settings: TenantSettings | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [logoUrl, setLogoUrl] = useState(settings?.logo_url ?? "");
  const [faviconUrl, setFaviconUrl] = useState(settings?.favicon_url ?? "");
  const [letterheadUrl, setLetterheadUrl] = useState(settings?.letterhead_url ?? "");
  const [signatureUrl, setSignatureUrl] = useState(settings?.signature_url ?? "");
  const [primary, setPrimary] = useState(settings?.primary_color ?? "");
  const [secondary, setSecondary] = useState(settings?.secondary_color ?? "");
  const [accent, setAccent] = useState(settings?.accent_color ?? "");
  const [font, setFont] = useState(settings?.font ?? "Inter");
  const [senderName, setSenderName] = useState(settings?.email_sender_name ?? "");
  const [currency, setCurrency] = useState(settings?.default_currency ?? "USD");
  const [timezone, setTimezone] = useState(settings?.default_timezone ?? "UTC");
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadGoogleFont(font); }, [font]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      tenant_id: tenant.id,
      logo_url: logoUrl || null,
      favicon_url: faviconUrl || null,
      primary_color: primary || null,
      secondary_color: secondary || null,
      accent_color: accent || null,
      font: font || null,
      letterhead_url: letterheadUrl || null,
      signature_url: signatureUrl || null,
      email_sender_name: senderName || null,
      default_currency: currency || "USD",
      default_timezone: timezone || "UTC",
    };
    const { error } = await supabase.from("tenant_settings").upsert(payload, { onConflict: "tenant_id" });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Settings saved");
    onSaved();
    onClose();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl w-[95vw] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{tenant.name} — Branding & Settings</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSave} className="space-y-6">

          {/* Logos */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Logo & Favicon</h3>
            <div className="grid gap-4 sm:grid-cols-2">
              <ImageField label="Logo" value={logoUrl} onChange={setLogoUrl} tenantId={tenant.id} kind="logo" />
              <ImageField label="Favicon" value={faviconUrl} onChange={setFaviconUrl} tenantId={tenant.id} kind="favicon" />
              <ImageField label="Letterhead" value={letterheadUrl} onChange={setLetterheadUrl} tenantId={tenant.id} kind="letterhead" />
              <ImageField label="Signature" value={signatureUrl} onChange={setSignatureUrl} tenantId={tenant.id} kind="signature" />
            </div>
          </section>

          {/* Colors */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Colors</h3>
            <p className="text-xs text-muted-foreground">
              Enter a hex code or use the picker. Preview shown below — changes apply only after Save.
            </p>
            <div className="grid gap-4 sm:grid-cols-3">
              <ColorField label="Primary" value={primary} onChange={setPrimary} placeholder="#0f172a" />
              <ColorField label="Secondary" value={secondary} onChange={setSecondary} placeholder="#475569" />
              <ColorField label="Accent" value={accent} onChange={setAccent} placeholder="#c9a24a" />
            </div>
            <ColorPreview primary={primary} secondary={secondary} accent={accent} />
          </section>

          {/* Font */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Font Family</h3>
            <p className="text-xs text-muted-foreground">
              Choose from 50 pre-integrated Google Fonts. Preview updates instantly; saved only when you click Save.
            </p>
            <FontPicker value={font} onChange={setFont} />
            <InterfacePreview
              name={tenant.name}
              logoUrl={logoUrl}
              primary={primary}
              secondary={secondary}
              accent={accent}
              font={font}
            />

          </section>

          {/* Meta */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold">Institution Meta</h3>
            <div className="grid gap-4 sm:grid-cols-3">
              <div>
                <Label>Email Sender Name</Label>
                <Input value={senderName} onChange={(e) => setSenderName(e.target.value)} />
              </div>
              <div>
                <Label>Default Currency</Label>
                <Input value={currency} onChange={(e) => setCurrency(e.target.value)} />
              </div>
              <div>
                <Label>Default Timezone</Label>
                <Input value={timezone} onChange={(e) => setTimezone(e.target.value)} />
              </div>
            </div>
          </section>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save Settings"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* -------- Image upload field -------- */

function ImageField({
  label, value, onChange, tenantId, kind,
}: {
  label: string;
  value: string;
  onChange: (url: string) => void;
  tenantId: string;
  kind: string;
}) {
  const [uploading, setUploading] = useState(false);
  const inputId = `upload-${kind}`;

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const ext = file.name.split(".").pop() ?? "png";
    const path = `${tenantId}/${kind}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("branding").upload(path, file, {
      upsert: true, contentType: file.type,
    });
    if (error) {
      setUploading(false);
      toast.error(error.message);
      return;
    }
    // Bucket is private (workspace blocks public buckets), so sign a long-lived URL.
    const { data: signed, error: signErr } = await supabase.storage
      .from("branding")
      .createSignedUrl(path, 60 * 60 * 24 * 365 * 10); // 10 years
    if (signErr || !signed?.signedUrl) {
      setUploading(false);
      toast.error(signErr?.message ?? "Could not generate URL");
      return;
    }
    onChange(signed.signedUrl);
    setUploading(false);
    toast.success(`${label} uploaded`);
    e.target.value = "";
  }

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="flex gap-3 items-start">
        <div className="grid h-16 w-16 shrink-0 place-items-center rounded-md border bg-muted overflow-hidden">
          {value ? (
            <img src={value} alt={`${label} preview`} className="h-full w-full object-contain" />
          ) : (
            <span className="text-[10px] opacity-50">Preview</span>
          )}
        </div>
        <div className="flex-1 space-y-2 min-w-0">
          <Input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Paste URL or upload"
            className="text-xs"
          />
          <div className="flex gap-2">
            <input id={inputId} type="file" accept="image/*" onChange={handleFile} className="hidden" />
            <Button type="button" size="sm" variant="outline" asChild disabled={uploading}>
              <label htmlFor={inputId} className="cursor-pointer">
                {uploading ? "Uploading…" : "Upload file"}
              </label>
            </Button>
            {value && (
              <Button type="button" size="sm" variant="ghost" onClick={() => onChange("")}>
                Clear
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* -------- Color field with picker + preview -------- */

function ColorField({
  label, value, onChange, placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const isValid = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value);
  return (
    <div>
      <Label>{label}</Label>
      <div className="flex items-center gap-2">
        <div
          className="h-9 w-9 shrink-0 rounded-md border"
          style={{ backgroundColor: isValid ? value : "transparent" }}
        />
        <Input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
        <input
          type="color"
          value={isValid ? (value.length === 4
            ? `#${value.slice(1).split("").map((c) => c + c).join("")}`
            : value) : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-10 rounded border cursor-pointer bg-transparent"
          aria-label={`${label} color picker`}
        />
      </div>
      {value && !isValid && (
        <p className="mt-1 text-[11px] text-destructive">Invalid hex (use #rgb or #rrggbb).</p>
      )}
    </div>
  );
}

function InterfacePreview({
  name, logoUrl, primary, secondary, accent, font,
}: {
  name: string;
  logoUrl: string;
  primary: string;
  secondary: string;
  accent: string;
  font: string;
}) {
  const nav = primary || "#0f172a";
  const acc = accent || "#c9a24a";
  const sec = secondary || "#475569";
  const family = font ? `"${font}", ui-sans-serif, system-ui, sans-serif` : undefined;

  return (
    <div className="rounded-md border bg-card p-4">
      <div className="mb-3 text-xs font-medium opacity-70">Interface preview</div>
      <div className="overflow-hidden rounded-md border" style={{ fontFamily: family }}>
        <div className="flex">
          <div className="hidden w-32 shrink-0 p-3 text-[11px] sm:block" style={{ backgroundColor: nav, color: "#fff" }}>
            <div className="mb-3 flex items-center gap-2">
              {logoUrl
                ? <img src={logoUrl} alt="" className="h-5 w-5 rounded-sm object-contain" />
                : <div className="h-5 w-5 rounded-sm" style={{ backgroundColor: acc }} />}
              <span className="truncate font-semibold">{name}</span>
            </div>
            {["Dashboard", "Students", "Fees"].map((l, i) => (
              <div key={l} className="rounded-sm px-2 py-1" style={i === 0 ? { backgroundColor: sec } : undefined}>{l}</div>
            ))}
          </div>
          <div className="flex-1 bg-background p-4">
            <div className="text-base font-semibold" style={{ color: nav }}>Student Overview</div>
            <p className="mt-1 text-xs text-muted-foreground">
              The quick brown fox jumps over the lazy dog — 0123456789
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="rounded-md px-3 py-1.5 text-xs font-medium text-white" style={{ backgroundColor: nav }}>
                Primary action
              </span>
              <span className="rounded-md px-3 py-1.5 text-xs font-medium text-white" style={{ backgroundColor: sec }}>
                Secondary
              </span>
              <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: acc, color: "#1a1a1a" }}>
                Accent badge
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ColorPreview({ primary, secondary, accent }: { primary: string; secondary: string; accent: string }) {

  const swatches = [
    { label: "Primary", color: primary },
    { label: "Secondary", color: secondary },
    { label: "Accent", color: accent },
  ];
  return (
    <div className="rounded-md border p-4 bg-card">
      <div className="text-xs font-medium mb-3 opacity-70">Preview</div>
      <div className="flex flex-wrap gap-3">
        {swatches.map((s) => (
          <div key={s.label} className="flex items-center gap-2">
            <div
              className="h-10 w-10 rounded-md border"
              style={{ backgroundColor: s.color || "transparent" }}
            />
            <div className="text-xs">
              <div className="font-medium">{s.label}</div>
              <div className="opacity-60">{s.color || "—"}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded-md px-3 py-1.5 text-xs font-medium text-white"
          style={{ backgroundColor: primary || "#334155" }}
        >
          Primary button
        </button>
        <button
          type="button"
          className="rounded-md px-3 py-1.5 text-xs font-medium"
          style={{ backgroundColor: secondary || "#e2e8f0", color: "#0f172a" }}
        >
          Secondary button
        </button>
        <span
          className="rounded-md px-3 py-1.5 text-xs font-medium"
          style={{ backgroundColor: accent || "#fef3c7", color: "#7c2d12" }}
        >
          Accent badge
        </span>
      </div>
    </div>
  );
}

/* -------- Font picker with live preview -------- */

function FontPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  useEffect(() => {
    // Preload all fonts once so the dropdown previews render in their own family.
    GOOGLE_FONTS.forEach(loadGoogleFont);
  }, []);

  return (
    <div className="space-y-3">
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger><SelectValue placeholder="Select font" /></SelectTrigger>
        <SelectContent className="max-h-72">
          {GOOGLE_FONTS.map((f) => (
            <SelectItem key={f} value={f}>
              <span style={{ fontFamily: `"${f}", sans-serif` }}>{f}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <div className="rounded-md border p-4 bg-card" style={{ fontFamily: `"${value}", sans-serif` }}>
        <div className="text-xs opacity-60 mb-1" style={{ fontFamily: "var(--font-sans)" }}>Preview — {value}</div>
        <div className="text-2xl font-semibold">The quick brown fox jumps over the lazy dog</div>
        <div className="text-sm mt-1 opacity-80">
          Admissions · Fees · Results · 0123456789
        </div>
      </div>
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
