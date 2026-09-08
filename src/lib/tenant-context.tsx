import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { loadGoogleFont } from "@/lib/google-fonts";


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
  /** Which examination systems this institution bought: board, cambridge or both. */
  academic_system: "board" | "cambridge" | "both";
  plan_name: string | null;
  feature_flags: Record<string, boolean> | null;
  student_limit: number | null;
  campus_limit: number | null;
  staff_limit: number | null;
  ai_message_limit: number | null;
};

type TenantContextValue = {
  tenant: TenantBranding | null;
  hostname: string;
  isLoading: boolean;
  /** Tenant whose branding is being previewed (visual only), if any. */
  preview: TenantBranding | null;
  setPreview: (t: TenantBranding | null) => void;
};

const TenantContext = createContext<TenantContextValue>({
  tenant: null,
  hostname: "",
  isLoading: true,
  preview: null,
  setPreview: () => {},
});

const PREVIEW_KEY = "educore.tenant-preview";

function readStoredPreview(): TenantBranding | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(PREVIEW_KEY);
    return raw ? (JSON.parse(raw) as TenantBranding) : null;
  } catch {
    return null;
  }
}

function getHostname(): string {
  if (typeof window === "undefined") return "";
  return window.location.hostname;
}


/**
 * Module-level cache of the last resolved tenant branding.
 * Populated by TenantProvider so non-React helpers (print templates, etc.)
 * can read the active tenant name/logo without React context.
 */
let cachedTenant: TenantBranding | null = null;
export function getActiveTenant(): TenantBranding | null {
  return cachedTenant;
}
export function getActiveTenantName(fallback = "EduCore"): string {
  return cachedTenant?.name ?? fallback;
}

/**
 * Validate hex like "#1a2b3c" or "#abc". Returns normalized 6-digit hex or null.
 */
function normalizeHex(hex: string | null | undefined): string | null {
  if (!hex) return null;
  const clean = hex.replace("#", "").trim();
  if (![3, 6].includes(clean.length)) return null;
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  if (!/^[0-9a-fA-F]{6}$/.test(full)) return null;
  return `#${full.toLowerCase()}`;
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

  const hostTenant = data ?? null;

  const [preview, setPreviewState] = useState<TenantBranding | null>(() => readStoredPreview());

  const setPreview = useCallback((t: TenantBranding | null) => {
    setPreviewState(t);
    if (typeof window === "undefined") return;
    try {
      if (t) window.sessionStorage.setItem(PREVIEW_KEY, JSON.stringify(t));
      else window.sessionStorage.removeItem(PREVIEW_KEY);
    } catch {
      /* storage unavailable — preview stays in memory only */
    }
  }, []);

  // Preview branding takes precedence over the host-resolved tenant (visual only).
  const tenant = preview ?? hostTenant;

  // Apply branding: CSS variables, page title, favicon
  useEffect(() => {
    if (!tenant || typeof document === "undefined") return;
    cachedTenant = tenant;

    const root = document.documentElement;
    const primary = normalizeHex(tenant.primary_color);
    const secondary = normalizeHex(tenant.secondary_color);
    const accent = normalizeHex(tenant.accent_color);

    // Override core theme tokens directly with hex — CSS custom properties
    // accept any valid color, so hex overrides the base oklch values.
    if (primary) {
      root.style.setProperty("--primary", primary);
      root.style.setProperty("--ring", primary);
      root.style.setProperty("--sidebar", primary);
      root.style.setProperty("--sidebar-primary-foreground", primary);
    } else {
      root.style.removeProperty("--primary");
      root.style.removeProperty("--ring");
      root.style.removeProperty("--sidebar");
      root.style.removeProperty("--sidebar-primary-foreground");
    }
    if (secondary) {
      root.style.setProperty("--secondary", secondary);
      root.style.setProperty("--sidebar-accent", secondary);
    } else {
      root.style.removeProperty("--secondary");
      root.style.removeProperty("--sidebar-accent");
    }
    if (accent) {
      root.style.setProperty("--accent", accent);
    } else {
      root.style.removeProperty("--accent");
    }
    if (tenant.font) {
      loadGoogleFont(tenant.font);
      root.style.setProperty("--font-sans", `"${tenant.font}", ui-sans-serif, system-ui, sans-serif`);
    } else {
      root.style.removeProperty("--font-sans");
    }


    // Keep the browser tab on the institution's own name. Page navigation
    // rewrites the title, so watch it and swap the platform name back out.
    let observer: MutationObserver | undefined;
    if (tenant.name) {
      const brand = tenant.name;
      const applyBrand = () => {
        const current = document.title;
        if (!current || current.includes(brand)) return;
        const next = current.includes("EduCore")
          ? current.replace(/EduCore/g, brand)
          : `${current} · ${brand}`;
        if (next !== current) document.title = next;
      };
      applyBrand();
      const titleEl = document.querySelector("title");
      if (titleEl) {
        observer = new MutationObserver(applyBrand);
        observer.observe(titleEl, { childList: true });
      }
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
    () => ({ tenant, hostname, isLoading, preview, setPreview }),
    [tenant, hostname, isLoading, preview, setPreview],
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
