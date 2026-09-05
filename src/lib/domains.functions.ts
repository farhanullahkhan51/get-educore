import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type DomainCheck = {
  domain: string;
  status: "pending" | "verified" | "failed";
  /** Record the institution must add at their DNS provider. */
  recordName: string;
  recordType: "TXT";
  recordValue: string;
  /** What DNS currently returns, for troubleshooting. */
  found: string[];
  message: string;
};

const dnsTxt = async (name: string): Promise<string[]> => {
  const res = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=TXT`, {
    headers: { accept: "application/dns-json" },
  });
  if (!res.ok) return [];
  const json = (await res.json()) as { Answer?: Array<{ data?: string }> };
  return (json.Answer ?? []).map((a) => (a.data ?? "").replace(/^"|"$/g, "").replace(/""/g, ""));
};

/** Checks the DNS TXT record for a tenant's custom domain and stores the result. */
export const verifyCustomDomain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenantId: string }) => {
    if (!input?.tenantId) throw new Error("tenantId is required");
    return input;
  })
  .handler(async ({ data, context }): Promise<DomainCheck> => {
    const { supabase } = context;
    const { data: tenant, error } = await supabase
      .from("tenants")
      .select("id, custom_domain, domain_verification_token")
      .eq("id", data.tenantId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!tenant) throw new Error("Institution not found or not accessible");

    const domain = (tenant.custom_domain ?? "").trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
    if (!domain) throw new Error("No custom domain has been set for this institution");

    let token = tenant.domain_verification_token;
    if (!token) {
      token = `educore-verify-${crypto.randomUUID()}`;
      const { error: tokenError } = await supabase
        .from("tenants")
        .update({ domain_verification_token: token })
        .eq("id", tenant.id);
      if (tokenError) throw new Error(tokenError.message);
    }

    const recordName = `_educore.${domain}`;
    const found = await dnsTxt(recordName);
    const ok = found.some((v) => v.trim() === token);
    const status: DomainCheck["status"] = ok ? "verified" : found.length ? "failed" : "pending";

    const { error: updateError } = await supabase
      .from("tenants")
      .update({ custom_domain_status: status })
      .eq("id", tenant.id);
    if (updateError) throw new Error(updateError.message);

    return {
      domain,
      status,
      recordName,
      recordType: "TXT",
      recordValue: token,
      found,
      message: ok
        ? "Domain verified — this address now serves the institution's branding."
        : found.length
          ? "A record was found but it does not match. Update the value and check again."
          : "No record found yet. Add the record below; DNS changes can take up to an hour.",
    };
  });

/** Returns the DNS record an institution needs to add, creating a token if needed. */
export const getDomainInstructions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { tenantId: string }) => {
    if (!input?.tenantId) throw new Error("tenantId is required");
    return input;
  })
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: tenant, error } = await supabase
      .from("tenants")
      .select("id, custom_domain, custom_domain_status, domain_verification_token")
      .eq("id", data.tenantId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!tenant) throw new Error("Institution not found or not accessible");

    const domain = (tenant.custom_domain ?? "").trim().toLowerCase();
    let token = tenant.domain_verification_token;
    if (domain && !token) {
      token = `educore-verify-${crypto.randomUUID()}`;
      await supabase.from("tenants").update({ domain_verification_token: token }).eq("id", tenant.id);
    }
    return {
      domain,
      status: (tenant.custom_domain_status ?? "pending") as string,
      recordName: domain ? `_educore.${domain}` : "",
      recordType: "TXT" as const,
      recordValue: token ?? "",
    };
  });
