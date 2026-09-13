import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { notAuthenticated, supabaseForUser } from "../supabase";

export default defineTool({
  name: "fees_summary",
  title: "Fees summary",
  description:
    "Summarise fee challans: total billed, collected, outstanding, and how many challans are overdue. Optionally for one billing period (YYYY-MM).",
  inputSchema: {
    period: z
      .string()
      .trim()
      .default("")
      .describe("Billing period as YYYY-MM, e.g. 2026-07. Leave empty for all periods."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ period }, ctx) => {
    if (!ctx.isAuthenticated()) return notAuthenticated();
    const supabase = supabaseForUser(ctx);

    const pageSize = 1000;
    let from = 0;
    const rows: { gross_amount: number; discount_amount: number; fine_amount: number; paid_amount: number; due_date: string; status: string }[] = [];
    for (;;) {
      let q = supabase
        .from("fee_challans")
        .select("gross_amount, discount_amount, fine_amount, paid_amount, due_date, status")
        .range(from, from + pageSize - 1);
      if (period) q = q.eq("period_label", period);
      const { data, error } = await q;
      if (error) return { content: [{ type: "text", text: error.message }], isError: true };
      rows.push(...(data ?? []));
      if (!data || data.length < pageSize) break;
      from += pageSize;
    }

    const today = new Date().toISOString().slice(0, 10);
    let billed = 0;
    let collected = 0;
    let overdue = 0;
    for (const r of rows) {
      const net = Number(r.gross_amount) - Number(r.discount_amount) + Number(r.fine_amount);
      const paid = Number(r.paid_amount);
      billed += net;
      collected += paid;
      if (paid < net && r.due_date < today && r.status !== "cancelled") overdue += 1;
    }
    const summary = {
      period: period || "all periods",
      challans: rows.length,
      billed,
      collected,
      outstanding: billed - collected,
      overdue_challans: overdue,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
      structuredContent: summary,
    };
  },
});
