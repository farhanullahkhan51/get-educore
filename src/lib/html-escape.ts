/** Escape a value for safe insertion into HTML text or attribute context. */
export function escapeHtml(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Deep-copy a record (or array) with every string value HTML-escaped, so stored
 * user data can be interpolated into print templates written via document.write.
 */
export function escapeDeep<T>(v: T): T {
  if (typeof v === "string") return escapeHtml(v) as unknown as T;
  if (Array.isArray(v)) return v.map((x) => escapeDeep(x)) as unknown as T;
  if (v && typeof v === "object" && !(v instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[k] = escapeDeep(x);
    return out as T;
  }
  return v;
}
