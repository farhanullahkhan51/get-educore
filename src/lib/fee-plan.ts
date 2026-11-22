/** The five fee heads a school quotes to a new family. */
export const FEE_HEADS = [
  { key: "registration", label: "Registration fee" },
  { key: "tuition", label: "Tuition fee" },
  { key: "security", label: "Security deposit (refundable)" },
  { key: "annual", label: "Annual subscription fee (non-refundable)" },
  { key: "admission", label: "Admission fee (non-refundable)" },
] as const;
export type FeeHead = (typeof FEE_HEADS)[number]["key"];
export type FeePlan = Record<FeeHead, number>;

type Structure = { name: string; category: string; amount: number | string; class_id?: string | null; active?: boolean };

/** Which head a fee structure belongs to, from its name first, then its category. */
export function headOf(s: Pick<Structure, "name" | "category">): FeeHead | null {
  const n = s.name.toLowerCase();
  if (/regist/.test(n)) return "registration";
  if (/secur|deposit/.test(n)) return "security";
  if (/annual|subscri/.test(n)) return "annual";
  if (/admission/.test(n)) return "admission";
  if (/tuition|monthly/.test(n)) return "tuition";
  if (s.category === "tuition") return "tuition";
  if (s.category === "admission") return "admission";
  return null;
}

/** The school's standard fees; a class-specific amount beats the campus-wide one. */
export function defaultFeePlan(structures: Structure[], classId?: string | null): FeePlan {
  const plan: FeePlan = { registration: 0, tuition: 0, security: 0, annual: 0, admission: 0 };
  const specific = new Set<FeeHead>();
  for (const s of structures) {
    if (s.active === false) continue;
    const h = headOf(s);
    if (!h) continue;
    const forClass = !!classId && s.class_id === classId;
    if (s.class_id && !forClass) continue;
    if (specific.has(h) && !forClass) continue;
    plan[h] = Number(s.amount) || 0;
    if (forClass) specific.add(h);
  }
  return plan;
}

export const planTotal = (p: Partial<FeePlan>) => FEE_HEADS.reduce((t, h) => t + (Number(p[h.key]) || 0), 0);
