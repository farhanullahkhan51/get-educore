import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** HMAC-SHA256 signature binding a QR link to one challan; key material never leaves the server. */
async function signId(id: string): Promise<string> {
  const secret = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!secret) throw new Error("Signing is not configured");
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(`challan-verify:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(id.toLowerCase())));
  return Array.from(sig.slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
}

function maskName(first?: string | null, last?: string | null): string {
  const f = (first ?? "").trim();
  const l = (last ?? "").trim();
  return `${f}${l ? ` ${l[0]}.` : ""}`.trim() || "—";
}

function maskCode(code?: string | null): string {
  if (!code) return "—";
  return code.length <= 3 ? "•••" : `${"•".repeat(Math.max(3, code.length - 3))}${code.slice(-3)}`;
}

export type ChallanVerification = {
  challanNo: string;
  status: string;
  studentName: string;
  studentCode: string;
  campusName: string;
  category: string;
  periodLabel: string | null;
  issueDate: string;
  dueDate: string;
  paidOn: string | null;
  gross: number;
  discount: number;
  fine: number;
  net: number;
  paid: number;
  balance: number;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Public lookup used by the QR code printed on fee vouchers. The challan's random ID acts as the access key. */
export const verifyChallan = createServerFn({ method: "GET" })
  .inputValidator((d: { id: string; t: string }) => {
    if (!d || typeof d.id !== "string" || !UUID.test(d.id)) throw new Error("Invalid voucher code");
    if (typeof d.t !== "string" || !/^[0-9a-f]{32}$/.test(d.t)) throw new Error("Invalid voucher code");
    return { id: d.id, t: d.t };
  })
  .handler(async ({ data }): Promise<ChallanVerification | null> => {
    if ((await signId(data.id)) !== data.t) return null;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: c } = await supabaseAdmin
      .from("fee_challans")
      .select("challan_no,status,category,period_label,issue_date,due_date,paid_on,gross_amount,discount_amount,fine_amount,paid_amount,student_id,campus_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!c) return null;
    const [{ data: s }, { data: campus }] = await Promise.all([
      supabaseAdmin.from("students").select("first_name,last_name,student_code").eq("id", c.student_id).maybeSingle(),
      supabaseAdmin.from("campuses").select("name").eq("id", c.campus_id).maybeSingle(),
    ]);
    const net = Number(c.gross_amount) - Number(c.discount_amount) + Number(c.fine_amount);
    const paid = Number(c.paid_amount);
    const today = new Date().toISOString().slice(0, 10);
    const status = c.status !== "paid" && c.status !== "waived" && c.due_date < today ? "overdue" : c.status;
    const sAny = s as { first_name?: string; last_name?: string | null; student_code?: string } | null;
    return {
      challanNo: c.challan_no,
      status,
      studentName: sAny ? maskName(sAny.first_name, sAny.last_name) : "—",
      studentCode: maskCode(sAny?.student_code),
      campusName: (campus as { name?: string } | null)?.name ?? "",
      category: c.category,
      periodLabel: c.period_label,
      issueDate: c.issue_date,
      dueDate: c.due_date,
      paidOn: c.paid_on,
      gross: Number(c.gross_amount),
      discount: Number(c.discount_amount),
      fine: Number(c.fine_amount),
      net,
      paid,
      balance: Math.max(0, net - paid),
    };
  });

/** Signed verification link for a challan the signed-in caller can read. */
export const getChallanVerifyToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => {
    if (!d || typeof d.id !== "string" || !UUID.test(d.id)) throw new Error("Invalid voucher code");
    return { id: d.id };
  })
  .handler(async ({ data, context }) => {
    const { data: row } = await context.supabase.from("fee_challans").select("id").eq("id", data.id).maybeSingle();
    if (!row) throw new Error("Voucher not found");
    return { t: await signId(data.id) };
  });
