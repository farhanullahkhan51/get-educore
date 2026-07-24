import { createContext, useContext, useEffect, useMemo, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type TenantBranding = {
  id: string;
  name: string;
  slug: string;
  status: string;
  custom_domain: string | null;
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

type TenantContextValue = {
  tenant: TenantBranding | null;
  hostname: string;
  isLoading: boolean;
};

const TenantContext = createContext<TenantContextValue>({
  tenant: null,
  hostname: "",
  isLoading: true,
});

function getHostname(): string {
  if (typeof window === "undefined") return "";
  return window.location.hostname;
}

/**
 * Convert a hex color like "#1a2b3c" to "26 43 60" (space-separated RGB)
 * so it can be assigned to an HSL/RGB CSS custom property consumed by Tailwind tokens.
 */
function hexToRgbTriplet(hex: string | null | undefined): string | null {
  if (!hex) return null;
  const clean = hex.replace("#", "").trim();
  if (![3, 6].includes(clean.length)) return null;
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return null;
  return `${r} ${g} ${b}`;
}

export function TenantProvider({ children }: { children: ReactNode }) {
  const hostname = getHostname();

  const { data, isLoading } = useQuery({
    queryKey: ["tenant-branding", hostname],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("resolve_tenant_by_host", {
        _host: hostname,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      return (row as TenantBranding) ?? null;
    },
    staleTime: 5 * 60 * 1000,
    enabled: typeof window !== "undefined",
  });

  const tenant = data ?? null;

  // Apply branding: CSS variables, page title, favicon
  useEffect(() => {
    if (!tenant || typeof document === "undefined") return;

    const root = document.documentElement;
    const primary = hexToRgbTriplet(tenant.primary_color);
    const secondary = hexToRgbTriplet(tenant.secondary_color);
    const accent = hexToRgbTriplet(tenant.accent_color);

    if (primary) root.style.setProperty("--tenant-primary", primary);
    if (secondary) root.style.setProperty("--tenant-secondary", secondary);
    if (accent) root.style.setProperty("--tenant-accent", accent);
    if (tenant.font) root.style.setProperty("--tenant-font", tenant.font);

    if (tenant.name) {
      document.title = `${tenant.name} — Academic ERP`;
    }

    if (tenant.favicon_url) {
      let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
      }
      link.href = tenant.favicon_url;
    }
  }, [tenant]);

  const value = useMemo(
    () => ({ tenant, hostname, isLoading }),
    [tenant, hostname, isLoading],
  );

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant(): TenantContextValue {
  return useContext(TenantContext);
}

/** Convenience: current tenant id, or null while resolving. */
export function useTenantId(): string | null {
  return useTenant().tenant?.id ?? null;
}
