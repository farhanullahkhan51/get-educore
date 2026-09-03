import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useTenantId } from "@/lib/tenant-context";
import { useCurrentUser } from "@/hooks/use-current-user";
import { insertAuditLog } from "@/lib/audit.functions";
import {
  EMPTY_LAYOUT,
  SPAN_OPTIONS,
  SURFACES,
  resolveSurface,
  sanitizeSurfaceLayout,
  type BlockHeight,
  type ResolvedBlock,
  type SurfaceLayout,
} from "@/lib/ui-surfaces";

type LayoutRow = { id: string; scope: string; layout: unknown };

type Ctx = {
  saved: Record<string, SurfaceLayout>;
  drafts: Record<string, SurfaceLayout>;
  editing: boolean;
  canEdit: boolean;
  saving: boolean;
  dirty: boolean;
  startEditing: () => void;
  discard: () => void;
  save: () => Promise<void>;
  update: (scope: string, fn: (l: SurfaceLayout) => SurfaceLayout) => void;
  resetScope: (scope: string) => Promise<void>;
  resetAll: () => Promise<void>;
};

const LayoutsContext = createContext<Ctx | null>(null);

const clone = (l: SurfaceLayout): SurfaceLayout => ({
  order: [...l.order],
  hidden: [...l.hidden],
  spans: { ...l.spans },
  heights: { ...l.heights },
  labels: { ...l.labels },
});

const EDIT_ROLES = ["super_admin", "educore_ceo", "campus_admin"];

export function UiLayoutsProvider({ children }: { children: ReactNode }) {
  const { data: user } = useCurrentUser();
  const tenantId = useTenantId();
  const qc = useQueryClient();
  const logAudit = useServerFn(insertAuditLog);
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, SurfaceLayout>>({});

  const { data: rows } = useQuery({
    queryKey: ["ui-layouts"],
    queryFn: async () =>
      ((await supabase.from("ui_layouts").select("id, scope, layout")).data ?? []) as LayoutRow[],
    staleTime: 60 * 1000,
  });

  const saved = useMemo(() => {
    const out: Record<string, SurfaceLayout> = {};
    for (const row of rows ?? []) {
      if (SURFACES[row.scope]) out[row.scope] = sanitizeSurfaceLayout(row.scope, row.layout);
    }
    return out;
  }, [rows]);

  const canEdit = (user?.roles ?? []).some((r) => EDIT_ROLES.includes(r));

  const update = useCallback((scope: string, fn: (l: SurfaceLayout) => SurfaceLayout) => {
    setDrafts((prev) => {
      const base = prev[scope] ?? clone(savedRef.current[scope] ?? EMPTY_LAYOUT);
      return { ...prev, [scope]: sanitizeSurfaceLayout(scope, fn(clone(base))) };
    });
  }, []);

  // keep a ref so `update` never goes stale between renders
  const savedRef = useRef(saved);
  savedRef.current = saved;

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("Institution not resolved yet");
      for (const [scope, layout] of Object.entries(drafts)) {
        const existing = (rows ?? []).find((r) => r.scope === scope);
        if (existing) {
          const { error } = await supabase
            .from("ui_layouts")
            .update({ layout: layout as never, updated_by: user?.userId ?? null })
            .eq("id", existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("ui_layouts")
            .insert({
              tenant_id: tenantId,
              scope,
              layout: layout as never,
              updated_by: user?.userId ?? null,
            });
          if (error) throw error;
        }
        await logAudit({
          data: {
            tenant_id: tenantId,
            action: "update",
            entity_type: "ui_layout",
            details: { scope, layout },
          },
        });
      }
    },
    onSuccess: () => {
      setDrafts({});
      setEditing(false);
      qc.invalidateQueries({ queryKey: ["ui-layouts"] });
    },
  });

  const resetMutation = useMutation({
    mutationFn: async (scopes: string[]) => {
      for (const scope of scopes) {
        const existing = (rows ?? []).find((r) => r.scope === scope);
        if (!existing) continue;
        const { error } = await supabase.from("ui_layouts").delete().eq("id", existing.id);
        if (error) throw error;
      }
    },
    onSuccess: (_d, scopes) => {
      setDrafts((prev) => {
        const next = { ...prev };
        for (const s of scopes) delete next[s];
        return next;
      });
      qc.invalidateQueries({ queryKey: ["ui-layouts"] });
    },
  });

  const value: Ctx = {
    saved,
    drafts,
    editing: editing && canEdit,
    canEdit,
    saving: saveMutation.isPending || resetMutation.isPending,
    dirty: Object.keys(drafts).length > 0,
    startEditing: () => setEditing(true),
    discard: () => {
      setDrafts({});
      setEditing(false);
    },
    save: async () => {
      await saveMutation.mutateAsync();
    },
    update,
    resetScope: async (scope) => {
      await resetMutation.mutateAsync([scope]);
    },
    resetAll: async () => {
      await resetMutation.mutateAsync(Object.keys(SURFACES));
    },
  };

  return <LayoutsContext.Provider value={value}>{children}</LayoutsContext.Provider>;
}

export function useUiLayouts(): Ctx {
  const ctx = useContext(LayoutsContext);
  if (!ctx) throw new Error("useUiLayouts must be used inside UiLayoutsProvider");
  return ctx;
}

const nextSpan = (span: number) => {
  const i = SPAN_OPTIONS.indexOf(span as (typeof SPAN_OPTIONS)[number]);
  return SPAN_OPTIONS[(i + 1) % SPAN_OPTIONS.length]!;
};

/** Read + edit one surface (dashboard, sidebar, module:<name>). */
export function useSurfaceLayout(scope: string) {
  const { saved, drafts, editing, canEdit, update, resetScope } = useUiLayouts();
  const layout = drafts[scope] ?? saved[scope];

  const blocks = useMemo(() => resolveSurface(scope, layout), [scope, layout]);
  const visible = useMemo(() => blocks.filter((b) => !b.hidden), [blocks]);

  const setOrder = useCallback(
    (ids: string[]) => update(scope, (l) => ({ ...l, order: ids })),
    [scope, update],
  );

  const move = useCallback(
    (id: string, toIndex: number) => {
      const ids = blocks.map((b) => b.id);
      const from = ids.indexOf(id);
      if (from === -1 || toIndex < 0 || toIndex >= ids.length || from === toIndex) return;
      ids.splice(toIndex, 0, ids.splice(from, 1)[0]!);
      setOrder(ids);
    },
    [blocks, setOrder],
  );

  const toggleHidden = useCallback(
    (id: string) =>
      update(scope, (l) => ({
        ...l,
        hidden: l.hidden.includes(id) ? l.hidden.filter((h) => h !== id) : [...l.hidden, id],
      })),
    [scope, update],
  );

  const cycleSpan = useCallback(
    (id: string) => {
      const block = blocks.find((b) => b.id === id);
      if (!block) return;
      update(scope, (l) => ({ ...l, spans: { ...l.spans, [id]: nextSpan(block.span) } }));
    },
    [blocks, scope, update],
  );

  const toggleHeight = useCallback(
    (id: string) => {
      const block = blocks.find((b) => b.id === id);
      if (!block) return;
      const h: BlockHeight = block.height === "tall" ? "short" : "tall";
      update(scope, (l) => ({ ...l, heights: { ...l.heights, [id]: h } }));
    },
    [blocks, scope, update],
  );

  const rename = useCallback(
    (id: string, label: string) =>
      update(scope, (l) => {
        const labels = { ...l.labels };
        const block = SURFACES[scope]?.blocks.find((b) => b.id === id);
        if (!label.trim() || label.trim() === block?.label) delete labels[id];
        else labels[id] = label.trim();
        return { ...l, labels };
      }),
    [scope, update],
  );

  return {
    blocks,
    visible,
    editing,
    canEdit,
    move,
    setOrder,
    toggleHidden,
    cycleSpan,
    toggleHeight,
    rename,
    reset: () => resetScope(scope),
  };
}

export type { ResolvedBlock };
