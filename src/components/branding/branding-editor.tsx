import { useEffect, useState } from "react";
import { GOOGLE_FONTS, loadGoogleFont } from "@/lib/google-fonts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

type Tenant = { id: string; name: string };

/* -------------------- Tenant Settings -------------------- */

export type TenantSettings = {
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

export function TenantSettingsDialog({ tenant, onClose }: { tenant: Tenant; onClose: () => void }) {
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

export function SettingsForm({
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


