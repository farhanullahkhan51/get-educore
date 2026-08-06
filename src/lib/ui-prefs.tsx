import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantId } from "@/lib/tenant-context";
import { defaultsFor, sanitizeLayout, type ModuleLayout } from "@/lib/ui-layout";

type PrefRow = { id: string; user_id: string | null; module: string; prefs: unknown };

type UiPrefsValue = {
  rows: PrefRow[];
  userId: string | null;
  canSetTenantDefault: boolean;
  isLoading: boolean;
};

const UiPrefsContext = createContext<UiPrefsValue>({
  rows: [],
  userId: null,
  canSetTenantDefault: false,
  isLoading: true,
});

export function UiPrefsProvider({ children }: { children: ReactNode }) {
  const { data: auth } = useQuery({
    queryKey: ["ui-prefs-user"],
    queryFn: async () => (await supabase.auth.getUser()).data.user ?? null,
    staleTime: 5 * 60 * 1000,
  });
  const userId = auth?.id ?? null;

  const { data: rows, isLoading } = useQuery({
    queryKey: ["ui-prefs"],
    enabled: !!userId,
    queryFn: async () =>
      ((await supabase.from("ui_preferences").select("id, user_id, module, prefs")).data ?? []) as PrefRow[],
  });

  const { data: isAdmin } = useQuery({
    queryKey: ["ui-prefs-admin", userId],
    enabled: !!userId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId!);
      return (data ?? []).some((r) => ["super_admin", "educore_ceo", "campus_admin"].includes(r.role));
    },
  });

  const value = useMemo<UiPrefsValue>(
    () => ({ rows: rows ?? [], userId, canSetTenantDefault: !!isAdmin, isLoading }),
    [rows, userId, isAdmin, isLoading],
  );
  return <UiPrefsContext.Provider value={value}>{children}</UiPrefsContext.Provider>;
}

export type LayoutScope = "personal" | "institution";

export function useModuleLayout(module: string) {
  const { rows, userId, canSetTenantDefault } = useContext(UiPrefsContext);
  const tenantId = useTenantId();
  const qc = useQueryClient();

  const tenantRow = rows.find((r) => r.module === module && r.user_id === null);
  const personalRow = rows.find((r) => r.module === module && r.user_id === userId);

  const layout = useMemo<ModuleLayout>(() => {
    const merged = {
      ...defaultsFor(module),
      ...((tenantRow?.prefs as Partial<ModuleLayout> | undefined) ?? {}),
      ...((personalRow?.prefs as Partial<ModuleLayout> | undefined) ?? {}),
    };
    return sanitizeLayout(module, merged);
  }, [module, tenantRow, personalRow]);

  const save = useMutation({
    mutationFn: async ({ next, scope }: { next: Partial<ModuleLayout>; scope: LayoutScope }) => {
      if (!tenantId || !userId) throw new Error("Not ready");
      const prefs = sanitizeLayout(module, { ...layout, ...next });
      const target = scope === "institution" ? null : userId;
      const existing = rows.find((r) => r.module === module && r.user_id === target);
      if (existing) {
        const { error } = await supabase.from("ui_preferences").update({ prefs }).eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("ui_preferences")
          .insert({ tenant_id: tenantId, user_id: target, module, prefs });
        if (error) throw error;
      }
      return prefs;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ui-prefs"] }),
  });

  const reset = useMutation({
    mutationFn: async (scope: LayoutScope) => {
      const target = scope === "institution" ? null : userId;
      const existing = rows.find((r) => r.module === module && r.user_id === target);
      if (!existing) return;
      const { error } = await supabase.from("ui_preferences").delete().eq("id", existing.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ui-prefs"] }),
  });

  const setLayout = useCallback(
    (next: Partial<ModuleLayout>, scope: LayoutScope = "personal") => save.mutateAsync({ next, scope }),
    [save],
  );

  return {
    layout,
    setLayout,
    resetLayout: (scope: LayoutScope = "personal") => reset.mutateAsync(scope),
    hasPersonal: !!personalRow,
    hasInstitution: !!tenantRow,
    canSetTenantDefault,
    saving: save.isPending || reset.isPending,
  };
}
