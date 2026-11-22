import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Copy, Globe, Palette, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useTenant } from "@/lib/tenant-context";
import { TenantSettingsDialog } from "@/components/branding/branding-editor";
import { getDomainInstructions, setOwnCustomDomain, verifyCustomDomain } from "@/lib/domains.functions";

export const Route = createFileRoute("/_authenticated/branding")({
  head: () => ({
    meta: [
      { title: "Branding & Web Address — EduCore" },
      { name: "description", content: "Set your school's logo, colours, fonts and own web address." },
      { property: "og:title", content: "Branding & Web Address — EduCore" },
      { property: "og:description", content: "Set your school's logo, colours, fonts and own web address." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BrandingPage,
});

function copy(v: string) {
  void navigator.clipboard.writeText(v);
  toast.success("Copied");
}

function BrandingPage() {
  const { data: me, isLoading: loading } = useCurrentUser();
  const roles = me?.roles ?? [];
  const { tenant } = useTenant();
  const [editOpen, setEditOpen] = useState(false);
  const qc = useQueryClient();
  const getInfo = useServerFn(getDomainInstructions);
  const saveDomain = useServerFn(setOwnCustomDomain);
  const verify = useServerFn(verifyCustomDomain);
  const [domainInput, setDomainInput] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const tenantId = tenant?.id;

  const info = useQuery({
    queryKey: ["own-domain", tenantId],
    enabled: !!tenantId,
    queryFn: () => getInfo({ data: { tenantId: tenantId! } }),
  });

  if (loading) return null;
  if (!roles.includes("super_admin")) return <Navigate to="/dashboard" />;
  if (!tenantId) return <p className="p-6 text-muted-foreground">No institution found for your account.</p>;

  const domain = info.data?.domain ?? "";
  const status = info.data?.status ?? "pending";
  const value = domainInput ?? domain;

  async function onSave() {
    setBusy(true);
    try {
      await saveDomain({ data: { domain: value } });
      setDomainInput(null);
      await qc.invalidateQueries({ queryKey: ["own-domain", tenantId] });
      toast.success(value ? "Web address saved — add the records below" : "Web address removed");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function onVerify() {
    setBusy(true);
    try {
      const r = await verify({ data: { tenantId: tenantId! } });
      await qc.invalidateQueries({ queryKey: ["own-domain", tenantId] });
      (r.status === "verified" ? toast.success : toast.warning)(r.message);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Branding & Web Address" description="How your school looks to staff, parents and the public." />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Palette className="h-4 w-4" /> Look & feel</CardTitle>
          <CardDescription>Logo, favicon, letterhead, signature, colours and font used across the system and on printed documents.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => setEditOpen(true)}>Edit branding</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Globe className="h-4 w-4" /> Your own web address</CardTitle>
          <CardDescription>Parents and students visiting this address see your school's own home page and sign-in.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="flex-1">
              <Label htmlFor="domain">Web address</Label>
              <Input id="domain" placeholder="portal.myschool.edu.pk" value={value} onChange={(e) => setDomainInput(e.target.value)} />
            </div>
            <Button onClick={onSave} disabled={busy || value === domain}>Save</Button>
          </div>

          {domain && (
            <>
              <div className="flex items-center gap-2 text-sm">
                Status: <Badge variant={status === "verified" || status === "active" ? "default" : "outline"}>{status}</Badge>
                <Button size="sm" variant="outline" onClick={onVerify} disabled={busy}>
                  <RefreshCw className="mr-1 h-3 w-3" /> Check now
                </Button>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">Add these two records where you bought your domain:</p>
                <RecordRow type="CNAME" name={domain} value="get-educore.lovable.app" />
                <RecordRow type="TXT" name={info.data?.recordName ?? ""} value={info.data?.recordValue ?? ""} />
                <p className="text-xs text-muted-foreground">Changes can take up to an hour to appear. After the check passes, the EduCore team switches the address on.</p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {editOpen && (
        <TenantSettingsDialog tenant={{ id: tenantId, name: tenant?.name ?? "Your institution" }} onClose={() => setEditOpen(false)} />
      )}
    </div>
  );
}

function RecordRow({ type, name, value }: { type: string; name: string; value: string }) {
  return (
    <div className="grid gap-2 rounded-md border bg-muted/40 p-3 text-xs sm:grid-cols-[70px_1fr_1fr_auto] sm:items-center">
      <span className="font-semibold">{type}</span>
      <code className="break-all">{name}</code>
      <code className="break-all">{value}</code>
      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => copy(value)} aria-label={`Copy ${type} value`}>
        <Copy className="h-3 w-3" />
      </Button>
    </div>
  );
}
