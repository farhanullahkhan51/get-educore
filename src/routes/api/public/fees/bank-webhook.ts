import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Real-time bank / 1Link / Kuickpay payment notifications.
 * Header `x-signature: <hex HMAC-SHA256 of raw body using BANK_WEBHOOK_SECRET>`.
 * Body: { action: "inquiry" | "payment", challan_no, txn_id?, amount?, paid_at?, provider? }
 * Idempotent: the same txn_id is only credited once.
 */
const Body = z.object({
  action: z.enum(["inquiry", "payment"]).default("payment"),
  challan_no: z.string().trim().min(3).max(64),
  txn_id: z.string().trim().min(1).max(128).optional(),
  amount: z.coerce.number().positive().max(100_000_000).optional(),
  paid_at: z.string().max(40).optional(),
  provider: z.string().trim().max(40).default("bank"),
});

async function hmacHex(secret: string, body: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export const Route = createFileRoute("/api/public/fees/bank-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["BANK_WEBHOOK_SECRET"];
        if (!secret) return Response.json({ error: "Not configured" }, { status: 503 });
        const raw = await request.text();
        const given = (request.headers.get("x-signature") ?? "").replace(/^sha256=/, "").toLowerCase();
        if (!given || !safeEqual(given, await hmacHex(secret, raw))) {
          return Response.json({ error: "Invalid signature" }, { status: 401 });
        }
        let parsed;
        try { parsed = Body.safeParse(JSON.parse(raw)); } catch { return Response.json({ error: "Invalid JSON" }, { status: 400 }); }
        if (!parsed.success) return Response.json({ error: "Invalid payload" }, { status: 400 });
        const b = parsed.data;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: ch } = await supabaseAdmin
          .from("fee_challans")
          .select("id, tenant_id, campus_id, challan_no, gross_amount, discount_amount, fine_amount, paid_amount, status, due_date")
          .eq("challan_no", b.challan_no)
          .maybeSingle();
        if (!ch) return Response.json({ status: "not_found" }, { status: 404 });
        const outstanding = Math.max(Number(ch.gross_amount) - Number(ch.discount_amount) + Number(ch.fine_amount) - Number(ch.paid_amount), 0);

        if (b.action === "inquiry") {
          return Response.json({ challan_no: ch.challan_no, amount_due: outstanding, due_date: ch.due_date, payable: outstanding > 0 && ch.status !== "waived" });
        }
        if (!b.txn_id || !b.amount) return Response.json({ error: "txn_id and amount required" }, { status: 400 });

        const extId = `hook:${b.provider}:${b.txn_id}`;
        const { data: existing } = await supabaseAdmin
          .from("bank_transactions").select("id, match_status")
          .eq("tenant_id", ch.tenant_id).eq("external_txn_id", extId).maybeSingle();
        if (existing) return Response.json({ status: "duplicate", reconciled: existing.match_status });

        const paidDate = b.paid_at && !Number.isNaN(Date.parse(b.paid_at)) ? new Date(b.paid_at).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
        const { data: txn, error } = await supabaseAdmin.from("bank_transactions").insert({
          tenant_id: ch.tenant_id, campus_id: ch.campus_id, txn_date: paidDate,
          reference: b.txn_id, description: `${b.provider} payment for ${ch.challan_no}`,
          amount: b.amount, source: "webhook", external_txn_id: extId,
        } as any).select("id").single();
        if (error || !txn) {
          if ((error as any)?.code === "23505") return Response.json({ status: "duplicate" });
          return Response.json({ error: "Could not record" }, { status: 500 });
        }

        if (outstanding <= 0) {
          await supabaseAdmin.from("bank_transactions").update({ match_status: "review", match_note: `Challan ${ch.challan_no} already settled — possible double payment` } as any).eq("id", txn.id);
          return Response.json({ status: "review" });
        }
        const { data: res, error: e2 } = await supabaseAdmin.rpc("apply_bank_payment" as any, { _txn_id: txn.id, _challan_id: ch.id });
        if (e2) {
          await supabaseAdmin.from("bank_transactions").update({ match_status: "review", match_note: e2.message } as any).eq("id", txn.id);
          return Response.json({ status: "review" });
        }
        return Response.json({ status: (res as any)?.status ?? "matched", applied: (res as any)?.applied });
      },
    },
  },
});
