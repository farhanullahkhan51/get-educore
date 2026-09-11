/**
 * Registry of the interface layout options each module supports.
 * Both the UI and the AI assistant validate against this registry, so the
 * assistant can never set an option a module does not actually implement.
 */

export type Density = "comfortable" | "compact";

export type ModuleLayout = {
  groupBy: string;
  filter: string;
  sortBy: string;
  density: Density;
  hidden: string[];
};

export type Option = { value: string; label: string };

export type ModuleSpec = {
  label: string;
  groupBy: Option[];
  filter: Option[];
  sortBy: Option[];
  columns: Option[];
  defaults: ModuleLayout;
};

const NONE: Option = { value: "none", label: "None" };
const ALL: Option = { value: "all", label: "All" };

function spec(
  label: string,
  o: {
    groupBy?: Option[];
    filter?: Option[];
    sortBy: Option[];
    columns?: Option[];
    defaults?: Partial<ModuleLayout>;
    /** Modules that must always keep Board and Cambridge apart cannot be ungrouped. */
    noNone?: boolean;
  },
): ModuleSpec {
  return {
    label,
    groupBy: [...(o.noNone ? [] : [NONE]), ...(o.groupBy ?? [])],
    filter: [ALL, ...(o.filter ?? [])],
    sortBy: o.sortBy,
    columns: o.columns ?? [],
    defaults: {
      groupBy: "none",
      filter: "all",
      sortBy: o.sortBy[0]!.value,
      density: "comfortable",
      hidden: [],
      ...o.defaults,
    },
  };
}

const TRACK_FILTER: Option[] = [
  { value: "board", label: "Board only" },
  { value: "cambridge", label: "Cambridge only" },
];
const TRACK_GROUP: Option[] = [{ value: "track", label: "Board / Cambridge" }];

export const MODULE_LAYOUTS: Record<string, ModuleSpec> = {
  classes: spec("Classes & Sections", {
    groupBy: [...TRACK_GROUP, { value: "campus", label: "Campus" }, { value: "year", label: "Academic year" }],
    filter: TRACK_FILTER,
    sortBy: [
      { value: "name", label: "Name" },
      { value: "campus", label: "Campus" },
      { value: "students", label: "Student count" },
    ],
    columns: [
      { value: "teacher", label: "Class teacher" },
      { value: "room", label: "Room" },
      { value: "capacity", label: "Capacity" },
    ],
    defaults: { groupBy: "track" },
    noNone: true,
  }),
  students: spec("Students", {
    groupBy: [
      ...TRACK_GROUP,
      { value: "campus", label: "Campus" },
      { value: "class", label: "Class" },
      { value: "status", label: "Status" },
    ],
    filter: [...TRACK_FILTER, { value: "active", label: "Active only" }, { value: "inactive", label: "Inactive only" }],
    sortBy: [
      { value: "name", label: "Name" },
      { value: "code", label: "Student ID" },
      { value: "class", label: "Class" },
    ],
    columns: [
      { value: "guardian", label: "Guardian" },
      { value: "campus", label: "Campus" },
      { value: "class", label: "Class / Section" },
      { value: "system", label: "System" },
      { value: "docs", label: "Documents" },
    ],
    defaults: { groupBy: "track" },
    noNone: true,
  }),
  staff: spec("Staff", {
    groupBy: [
      { value: "track", label: "Teaching track" },
      { value: "campus", label: "Campus" },
      { value: "department", label: "Department" },
      { value: "status", label: "Status" },
    ],
    filter: [
      { value: "board", label: "Board teachers" },
      { value: "cambridge", label: "Cambridge teachers" },
      { value: "active", label: "Active only" },
    ],
    sortBy: [
      { value: "name", label: "Name" },
      { value: "code", label: "Staff code" },
      { value: "designation", label: "Designation" },
    ],
    columns: [
      { value: "department", label: "Department" },
      { value: "campus", label: "Campus" },
      { value: "contact", label: "Contact" },
      { value: "track", label: "Teaching track" },
    ],
    defaults: { groupBy: "track" },
  }),
  courses: spec("Courses", {
    groupBy: [
      { value: "program", label: "Program / group" },
      ...TRACK_GROUP,
      { value: "campus", label: "Campus" },
      { value: "class", label: "Class" },
    ],
    filter: [...TRACK_FILTER, { value: "active", label: "Active only" }],
    sortBy: [
      { value: "program", label: "Program / group" },
      { value: "title", label: "Title" },
      { value: "code", label: "Code" },
    ],
    columns: [
      { value: "credits", label: "Credit hours" },
      { value: "campus", label: "Campus" },
      { value: "class", label: "Class" },
    ],
    defaults: { groupBy: "program", sortBy: "title" },
  }),
  fees: spec("Fees", {
    groupBy: [
      { value: "status", label: "Payment status" },
      { value: "category", label: "Fee category" },
      { value: "campus", label: "Campus" },
    ],
    filter: [
      { value: "unpaid", label: "Unpaid & overdue" },
      { value: "paid", label: "Paid only" },
    ],
    sortBy: [
      { value: "due", label: "Due date" },
      { value: "amount", label: "Amount" },
      { value: "student", label: "Student" },
    ],
    columns: [
      { value: "category", label: "Category" },
      { value: "period", label: "Period" },
      { value: "campus", label: "Campus" },
    ],
  }),
  admissions: spec("Admissions", {
    groupBy: [...TRACK_GROUP, { value: "campus", label: "Campus" }, { value: "source", label: "Source" }],
    filter: TRACK_FILTER,
    sortBy: [
      { value: "recent", label: "Most recent" },
      { value: "name", label: "Student name" },
    ],
    columns: [],
  }),
  certificates: spec("Certificates", {
    groupBy: [
      { value: "type", label: "Certificate type" },
      { value: "status", label: "Status" },
      { value: "campus", label: "Campus" },
    ],
    filter: [
      { value: "issued", label: "Issued only" },
      { value: "revoked", label: "Revoked only" },
    ],
    sortBy: [
      { value: "recent", label: "Most recent" },
      { value: "recipient", label: "Recipient" },
      { value: "serial", label: "Serial number" },
    ],
    columns: [{ value: "type", label: "Type" }, { value: "campus", label: "Campus" }],
  }),
  results: spec("Results", {
    groupBy: [{ value: "status", label: "Status" }, { value: "term", label: "Term" }],
    filter: [
      { value: "published", label: "Published only" },
      { value: "draft", label: "Drafts only" },
    ],
    sortBy: [
      { value: "student", label: "Student" },
      { value: "marks", label: "Marks" },
    ],
    columns: [],
  }),
};

export type ModuleKey = keyof typeof MODULE_LAYOUTS;

export const MODULE_KEYS = Object.keys(MODULE_LAYOUTS);

export function defaultsFor(module: string): ModuleLayout {
  const s = MODULE_LAYOUTS[module];
  return s ? { ...s.defaults, hidden: [...s.defaults.hidden] } : { groupBy: "none", filter: "all", sortBy: "name", density: "comfortable", hidden: [] };
}

/** Keep only values the module actually supports. */
export function sanitizeLayout(module: string, input: Partial<ModuleLayout> | null | undefined): ModuleLayout {
  const s = MODULE_LAYOUTS[module];
  const base = defaultsFor(module);
  if (!s || !input) return base;
  const pick = (opts: Option[], v: unknown, fallback: string) =>
    typeof v === "string" && opts.some((o) => o.value === v) ? v : fallback;
  return {
    groupBy: pick(s.groupBy, input.groupBy, base.groupBy),
    filter: pick(s.filter, input.filter, base.filter),
    sortBy: pick(s.sortBy, input.sortBy, base.sortBy),
    density: input.density === "compact" || input.density === "comfortable" ? input.density : base.density,
    hidden: Array.isArray(input.hidden)
      ? input.hidden.filter((h) => s.columns.some((c) => c.value === h))
      : base.hidden,
  };
}

export function describeLayout(module: string, layout: ModuleLayout): string {
  const s = MODULE_LAYOUTS[module];
  if (!s) return "";
  const label = (opts: Option[], v: string) => opts.find((o) => o.value === v)?.label ?? v;
  const bits = [
    `grouped by ${label(s.groupBy, layout.groupBy).toLowerCase()}`,
    `showing ${label(s.filter, layout.filter).toLowerCase()}`,
    `sorted by ${label(s.sortBy, layout.sortBy).toLowerCase()}`,
    `${layout.density} density`,
  ];
  if (layout.hidden.length) bits.push(`hiding ${layout.hidden.map((h) => label(s.columns, h)).join(", ")}`);
  return bits.join(", ");
}

/** True when the layout differs from the module's built-in defaults. */
export function isCustomised(module: string, layout: ModuleLayout): boolean {
  const d = defaultsFor(module);
  return (
    d.groupBy !== layout.groupBy ||
    d.filter !== layout.filter ||
    d.sortBy !== layout.sortBy ||
    d.density !== layout.density ||
    d.hidden.length !== layout.hidden.length
  );
}
