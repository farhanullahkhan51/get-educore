/** Shared, browser-safe rules for the document scanner. */

export type DocKind = "student" | "staff" | "fee_receipt" | "unknown";

export type ScannedField = {
  key: string;
  value: string;
  /** 0..1 — how sure the reader is about this exact value */
  confidence: number;
};

export type ScanResult = {
  kind: DocKind;
  legible: boolean;
  qualityIssues: string[];
  authenticityNotes: string[];
  fields: ScannedField[];
  model: string;
};

/** Below this, a field is flagged and must be checked by hand before saving. */
export const LOW_CONFIDENCE = 0.85;

export const FIELD_KEYS: Record<Exclude<DocKind, "unknown">, string[]> = {
  student: [
    "student_code", "first_name", "last_name", "date_of_birth", "gender",
    "guardian_name", "guardian_phone", "guardian_occupation", "address",
  ],
  staff: [
    "staff_code", "first_name", "last_name", "phone", "email",
    "designation", "department", "qualification", "address", "date_of_joining",
  ],
  fee_receipt: ["challan_no", "student_code", "amount_paid", "paid_on", "bank_reference"],
};

export function fieldMap(fields: ScannedField[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of fields) if (f.value.trim()) out[f.key] = f.value.trim();
  return out;
}

/**
 * Build the change set for an existing record.
 * - "update": only fills fields that are currently empty, never overwrites.
 * - "replace": overwrites with every non-empty scanned value.
 */
export function buildChanges(
  existing: Record<string, unknown>,
  scanned: Record<string, string>,
  allowed: string[],
  mode: "update" | "replace",
): Record<string, string> {
  const changes: Record<string, string> = {};
  for (const key of allowed) {
    const next = scanned[key]?.trim();
    if (!next) continue;
    const current = existing[key];
    const isEmpty = current === null || current === undefined || String(current).trim() === "";
    if (mode === "update" && !isEmpty) continue;
    if (String(current ?? "") === next) continue;
    changes[key] = next;
  }
  return changes;
}

/** Apply a scanned payment to a challan. Returns null when the amount is invalid. */
export function applyPayment(
  challan: { gross_amount: number; discount_amount: number; fine_amount: number; paid_amount: number },
  amount: number,
): { paid_amount: number; status: "paid" | "partial"; overpaid: number } | null {
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const net = Number(challan.gross_amount) - Number(challan.discount_amount) + Number(challan.fine_amount);
  const paid = Number(challan.paid_amount) + amount;
  return {
    paid_amount: Math.min(paid, net),
    status: paid >= net ? "paid" : "partial",
    overpaid: Math.max(0, paid - net),
  };
}

/** Accept only real calendar dates in YYYY-MM-DD. */
export function isValidIsoDate(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}
