/**
 * Registry of every editable interface surface and the blocks it contains.
 *
 * Saved layouts are merged OVER this registry, and unknown block ids in a saved
 * layout are ignored — so blocks we ship later appear automatically and blocks
 * we remove can never break a page.
 */

export type BlockHeight = "short" | "tall";

export type SurfaceBlock = {
  id: string;
  label: string;
  /** 12-column grid span (grid surfaces only). */
  span?: number;
  height?: BlockHeight;
  canHide?: boolean;
  canResize?: boolean;
  canRename?: boolean;
};

export type SurfaceKind = "grid" | "list" | "tabs";

export type Surface = {
  key: string;
  label: string;
  kind: SurfaceKind;
  blocks: SurfaceBlock[];
};

export type SurfaceLayout = {
  order: string[];
  hidden: string[];
  spans: Record<string, number>;
  heights: Record<string, BlockHeight>;
  labels: Record<string, string>;
};

export const EMPTY_LAYOUT: SurfaceLayout = { order: [], hidden: [], spans: {}, heights: {}, labels: {} };

export const SPAN_OPTIONS = [3, 4, 6, 12] as const;
export const SPAN_LABEL: Record<number, string> = {
  3: "Quarter width",
  4: "Third width",
  6: "Half width",
  12: "Full width",
};

const grid = (key: string, label: string, blocks: SurfaceBlock[]): Surface => ({
  key,
  label,
  kind: "grid",
  blocks: blocks.map((b) => ({ span: 3, height: "short", canHide: true, canResize: true, canRename: true, ...b })),
});

const list = (key: string, label: string, blocks: SurfaceBlock[]): Surface => ({
  key,
  label,
  kind: "list",
  blocks: blocks.map((b) => ({ canHide: true, canResize: false, canRename: true, ...b })),
});

const tabs = (key: string, label: string, blocks: SurfaceBlock[]): Surface => ({
  key,
  label,
  kind: "tabs",
  blocks: blocks.map((b) => ({ canHide: true, canResize: false, canRename: true, ...b })),
});

export const SURFACES: Record<string, Surface> = {
  dashboard: grid("dashboard", "Dashboard", [
    { id: "kpi-students", label: "Active Students" },
    { id: "kpi-staff", label: "Active Staff" },
    { id: "kpi-collection", label: "Fee Collection" },
    { id: "kpi-attendance", label: "Attendance (6 mo)" },
    { id: "kpi-outstanding", label: "Outstanding Dues" },
    { id: "kpi-inquiries", label: "Inquiries (6 mo)" },
    { id: "kpi-collected", label: "Collected" },
    { id: "kpi-campuses", label: "Campuses in view" },
    { id: "chart-revenue", label: "Billed vs Collected", span: 6, height: "short" },
    { id: "chart-attendance", label: "Attendance Trend", span: 6, height: "short" },
    { id: "chart-funnel", label: "Admissions Funnel", span: 6, height: "short" },
    { id: "chart-programs", label: "Enrollment by Program", span: 6, height: "short" },
    { id: "table-campuses", label: "Campus Comparison", span: 12, height: "short" },
  ]),

  sidebar: list("sidebar", "Sidebar navigation", [
    { id: "/dashboard", label: "Dashboard" },
    { id: "/portal", label: "My Portal" },
    { id: "/campuses", label: "Campuses" },
    { id: "/programs", label: "Programs" },
    { id: "/classes", label: "Classes & Sections" },
    { id: "/admissions", label: "Admissions" },
    { id: "/students", label: "Students" },
    { id: "/staff", label: "Staff" },
    { id: "/courses", label: "Courses" },
    { id: "/academics", label: "Academics" },
    { id: "/results", label: "Results" },
    { id: "/board", label: "BISE Board" },
    { id: "/cambridge", label: "Cambridge" },
    { id: "/track-switch", label: "Track Switch" },
    { id: "/timetable", label: "Timetable" },
    { id: "/staff-attendance", label: "Staff Attendance" },
    { id: "/notices", label: "Notice Board" },
    { id: "/fees", label: "Fees & Finance" },
    { id: "/certificates", label: "Certificates" },
    { id: "/import-export", label: "Import & Export" },
    { id: "/billing", label: "Billing & Plan" },
    { id: "/users", label: "Users & Roles" },
    { id: "/platform", label: "Platform Admin" },
  ]),

  "module:academics": tabs("module:academics", "Academics tabs", [
    { id: "attendance", label: "Attendance" },
    { id: "gradebook", label: "Gradebook" },
  ]),
  "module:admissions": tabs("module:admissions", "Admissions tabs", [
    { id: "board", label: "Kanban" },
    { id: "table", label: "Table" },
  ]),
  "module:courses": tabs("module:courses", "Courses tabs", [
    { id: "courses", label: "Courses" },
    { id: "assignments", label: "Teaching Assignments" },
  ]),
  "module:fees": tabs("module:fees", "Fees tabs", [
    { id: "challans", label: "Challans" },
    { id: "structures", label: "Fee Structures" },
    { id: "scholarships", label: "Scholarships" },
    { id: "bank", label: "Bank Reconciliation" },
  ]),
  "module:board": tabs("module:board", "BISE Board tabs", [
    { id: "registrations", label: "Registrations" },
    { id: "rollslips", label: "Roll Slips & Admit Cards" },
    { id: "results", label: "Results" },
  ]),
  "module:cambridge": tabs("module:cambridge", "Cambridge tabs", [
    { id: "registrations", label: "Registrations" },
    { id: "statements", label: "Statements of Entry" },
    { id: "results", label: "Results" },
  ]),
  "module:portal": tabs("module:portal", "Student portal tabs", [
    { id: "attendance", label: "Attendance" },
    { id: "fees", label: "Fees" },
    { id: "results", label: "Results" },
    { id: "deadlines", label: "Deadlines" },
    { id: "certificates", label: "Certificates" },
    { id: "profile", label: "Profile" },
  ]),
};

export const SURFACE_KEYS = Object.keys(SURFACES) as [string, ...string[]];

export type ResolvedBlock = SurfaceBlock & {
  span: number;
  height: BlockHeight;
  hidden: boolean;
  label: string;
  defaultLabel: string;
};

/** Normalise anything read from the database into a usable layout. */
export function sanitizeSurfaceLayout(key: string, raw: unknown): SurfaceLayout {
  const surface = SURFACES[key];
  if (!surface) return { ...EMPTY_LAYOUT };
  const ids = new Set(surface.blocks.map((b) => b.id));
  const v = (raw ?? {}) as Partial<SurfaceLayout>;

  const order = Array.isArray(v.order) ? v.order.filter((id) => ids.has(id)) : [];
  const hidden = Array.isArray(v.hidden) ? v.hidden.filter((id) => ids.has(id)) : [];

  const spans: Record<string, number> = {};
  for (const [id, span] of Object.entries(v.spans ?? {})) {
    if (ids.has(id) && SPAN_OPTIONS.includes(span as (typeof SPAN_OPTIONS)[number])) spans[id] = span as number;
  }
  const heights: Record<string, BlockHeight> = {};
  for (const [id, h] of Object.entries(v.heights ?? {})) {
    if (ids.has(id) && (h === "short" || h === "tall")) heights[id] = h;
  }
  const labels: Record<string, string> = {};
  for (const [id, label] of Object.entries(v.labels ?? {})) {
    if (ids.has(id) && typeof label === "string" && label.trim()) labels[id] = label.trim().slice(0, 60);
  }
  return { order, hidden, spans, heights, labels };
}

/** Merge a saved layout over the registry defaults. */
export function resolveSurface(key: string, layout: SurfaceLayout | undefined): ResolvedBlock[] {
  const surface = SURFACES[key];
  if (!surface) return [];
  const l = layout ?? EMPTY_LAYOUT;
  const index = new Map(surface.blocks.map((b, i) => [b.id, i]));
  const rank = (id: string) => {
    const at = l.order.indexOf(id);
    return at === -1 ? 1000 + (index.get(id) ?? 0) : at;
  };
  return [...surface.blocks]
    .sort((a, b) => rank(a.id) - rank(b.id))
    .map((b) => ({
      ...b,
      span: l.spans[b.id] ?? b.span ?? 3,
      height: l.heights[b.id] ?? b.height ?? "short",
      hidden: l.hidden.includes(b.id),
      defaultLabel: b.label,
      label: l.labels[b.id] ?? b.label,
    }));
}

export function isLayoutCustomised(layout: SurfaceLayout | undefined): boolean {
  if (!layout) return false;
  return (
    layout.order.length > 0 ||
    layout.hidden.length > 0 ||
    Object.keys(layout.spans).length > 0 ||
    Object.keys(layout.heights).length > 0 ||
    Object.keys(layout.labels).length > 0
  );
}

export function describeSurfaceLayout(key: string): string {
  const surface = SURFACES[key];
  return surface ? surface.label : key;
}
