/**
 * Bilingual (English + Urdu) circular helpers. The calling AI writes both
 * languages; this module validates, numbers and saves them. RLS applies.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyClient = SupabaseClient<any, any, any>;

export const URDU_DIVIDER = "\n\n────────── اردو ──────────\n\n";
export const CATEGORIES = ["general", "academic", "administrative", "holiday", "examination", "fees"] as const;
export const AUDIENCES = ["all", "staff", "students"] as const;
export const PRIORITIES = ["normal", "urgent", "critical"] as const;

const URDU_RE = /[\u0600-\u06FF]/;
export const hasUrdu = (s: string) => URDU_RE.test(s);

export type BilingualInput = {
  title_en: string; title_ur: string; content_en: string; content_ur: string;
  category?: (typeof CATEGORIES)[number]; audience?: (typeof AUDIENCES)[number]; priority?: (typeof PRIORITIES)[number];
  expires_at?: string | null; publish?: boolean; campus_id?: string | null; issued_by?: string | null;
};

export function validateBilingual(i: BilingualInput): string | null {
  if (!i.title_en.trim() || !i.content_en.trim()) return "English title and text are required.";
  if (!hasUrdu(i.title_ur) || !hasUrdu(i.content_ur)) return "Urdu title and text must be written in Urdu script.";
  if (hasUrdu(i.title_en) && !/[A-Za-z]/.test(i.title_en)) return "The English title appears to be in Urdu.";
  if (i.expires_at && Number.isNaN(Date.parse(i.expires_at))) return "Expiry date is not a valid date.";
  if (i.expires_at && Date.parse(i.expires_at) < Date.now() - 86400000) return "Expiry date is in the past.";
  return null;
}

export const combineTitle = (en: string, ur: string) => `${en.trim()} | ${ur.trim()}`.slice(0, 300);
export const combineContent = (en: string, ur: string) => `${en.trim()}${URDU_DIVIDER}${ur.trim()}`;

/** Splits a saved bilingual notice back into its two languages. */
export function splitBilingual(title: string, content: string) {
  const [content_en, content_ur = ""] = content.split(URDU_DIVIDER);
  const idx = title.lastIndexOf(" | ");
  const bilingual = idx > 0 && hasUrdu(title.slice(idx));
  return {
    title_en: bilingual ? title.slice(0, idx) : title, title_ur: bilingual ? title.slice(idx + 3) : "",
    content_en, content_ur, is_bilingual: !!content_ur,
  };
}

export async function nextReference(sb: AnyClient, year = new Date().getFullYear()) {
  const prefix = `CIR/${year}/`;
  const { data } = await sb.from("notices").select("reference_no").like("reference_no", `${prefix}%`);
  const max = Math.max(0, ...((data ?? []) as { reference_no: string }[]).map((n) => Number(n.reference_no.slice(prefix.length)) || 0));
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

export async function saveBilingualNotice(sb: AnyClient, i: BilingualInput) {
  const err = validateBilingual(i);
  if (err) throw new Error(err);
  for (let attempt = 0; attempt < 3; attempt++) {
    const reference_no = await nextReference(sb);
    const { data, error } = await sb.from("notices").insert({
      reference_no,
      title: combineTitle(i.title_en, i.title_ur),
      content: combineContent(i.content_en, i.content_ur),
      category: i.category ?? "general", audience: i.audience ?? "all", priority: i.priority ?? "normal",
      expires_at: i.expires_at || null, is_published: i.publish ?? false,
      ...(i.campus_id ? { campus_id: i.campus_id } : {}),
      ...(i.issued_by ? { issued_by: i.issued_by } : {}),
    }).select("id, reference_no, title, is_published, audience, priority").single();
    if (!error) return data;
    if (error.code !== "23505") throw new Error(error.message); // retry on reference clash
  }
  throw new Error("Could not assign a circular number. Try again.");
}
