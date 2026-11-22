import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

export type PublicSite = {
  /** Institution name to show and to use in page titles. */
  name: string;
  logoUrl: string | null;
  /** Absolute origin the visitor arrived on, e.g. https://school.example.com */
  origin: string;
  /** True when this is the platform's own address, not an institution's. */
  isPlatform: boolean;
  /** Set only on an institution's own address. */
  tenantId: string | null;
  primaryColor: string | null;
  academicSystem: string | null;
};

const FALLBACK: PublicSite = {
  name: "EduCore",
  logoUrl: null,
  origin: "https://get-educore.lovable.app",
  isPlatform: true,
  tenantId: null,
  primaryColor: null,
  academicSystem: null,
};

/**
 * Resolves the institution that owns the web address the visitor came in on,
 * so public pages can render and title themselves as that institution.
 */
export const getPublicSite = createServerFn({ method: "GET" }).handler(async (): Promise<PublicSite> => {
  let origin = FALLBACK.origin;
  let host = "";
  try {
    const request = getRequest();
    const url = new URL(request.url);
    const forwardedHost = request.headers.get("x-forwarded-host");
    const forwardedProto = request.headers.get("x-forwarded-proto");
    host = (forwardedHost || url.host).split(",")[0]!.trim();
    const proto = (forwardedProto || url.protocol.replace(":", "")).split(",")[0]!.trim();
    origin = `${proto}://${host}`;
  } catch {
    return FALLBACK;
  }

  try {
    const { createClient } = await import("@supabase/supabase-js");
    const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
    const supabase = createClient(process.env["SUPABASE_URL"]!, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: {
        fetch: (input, init) => {
          const headers = new Headers(init?.headers);
          if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) {
            headers.delete("Authorization");
          }
          headers.set("apikey", key);
          return fetch(input, { ...init, headers });
        },
      },
    });

    const { data, error } = await supabase.rpc("resolve_tenant_by_host", { _host: host });
    if (error) return { ...FALLBACK, origin };
    const row = (Array.isArray(data) ? data[0] : data) as
      | { id?: string; name?: string | null; slug?: string | null; logo_url?: string | null; primary_color?: string | null; academic_system?: string | null }
      | undefined;
    if (!row?.name) return { ...FALLBACK, origin };
    return {
      name: row.name,
      logoUrl: row.logo_url ?? null,
      origin,
      isPlatform: row.slug === "educore",
      tenantId: row.slug === "educore" ? null : (row.id ?? null),
      primaryColor: row.primary_color ?? null,
      academicSystem: row.academic_system ?? null,
    };
  } catch {
    return { ...FALLBACK, origin };
  }
});
