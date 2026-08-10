import { useMemo } from "react";
import type { ModuleLayout } from "@/lib/ui-layout";

export type Accessors<T> = {
  group?: Record<string, (row: T) => string>;
  filter?: Record<string, (row: T) => boolean>;
  sort?: Record<string, (a: T, b: T) => number>;
};

export type RowGroup<T> = { key: string; label: string; rows: T[] };

/** Apply a module layout (filter -> sort -> group) to a list of rows. */
export function arrange<T>(rows: T[], layout: ModuleLayout, acc: Accessors<T>): RowGroup<T>[] {
  const filterFn = acc.filter?.[layout.filter];
  const sortFn = acc.sort?.[layout.sortBy];
  const groupFn = acc.group?.[layout.groupBy];

  let list = filterFn ? rows.filter(filterFn) : [...rows];
  if (sortFn) list = list.sort(sortFn);
  if (!groupFn) return [{ key: "", label: "", rows: list }];

  const map = new Map<string, T[]>();
  for (const row of list) {
    const label = groupFn(row) || "—";
    const bucket = map.get(label);
    if (bucket) bucket.push(row);
    else map.set(label, [row]);
  }
  return [...map.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([label, groupRows]) => ({ key: label, label, rows: groupRows }));
}

export function useArranged<T>(rows: T[], layout: ModuleLayout, acc: Accessors<T>): RowGroup<T>[] {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => arrange(rows, layout, acc), [rows, layout]);
}

export const byText =
  <T,>(get: (r: T) => string | null | undefined) =>
  (a: T, b: T) =>
    (get(a) ?? "").localeCompare(get(b) ?? "", undefined, { numeric: true, sensitivity: "base" });

export const byNumberDesc =
  <T,>(get: (r: T) => number) =>
  (a: T, b: T) =>
    get(b) - get(a);

/** Extra cell classes for the chosen density. */
export const densityCell = (d: ModuleLayout["density"]) =>
  d === "compact" ? "!py-1 !px-2 text-[13px] leading-tight" : "";
