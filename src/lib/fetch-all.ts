/**
 * The backend returns at most 1,000 rows per request. Any list that could grow
 * past that must be read page by page, otherwise counts and totals shown on
 * screen silently stop matching the stored records.
 *
 * Usage:
 *   const rows = await fetchAllRows((from, to) =>
 *     supabase.from("students").select("*").order("created_at").range(from, to));
 */
export async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  options?: { pageSize?: number; maxRows?: number },
): Promise<T[]> {
  const size = options?.pageSize ?? 1000;
  const max = options?.maxRows ?? 50_000;
  const all: T[] = [];

  for (let from = 0; from < max; from += size) {
    const { data, error } = await page(from, from + size - 1);
    if (error) throw new Error(error.message);
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < size) break;
  }

  return all;
}
