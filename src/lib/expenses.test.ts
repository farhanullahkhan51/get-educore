import { describe, it, expect } from "vitest";
import { pettyCashBalance, spentTotal } from "./expenses";

const r = (o: any) => ({ entry_type: "expense", payment_mode: "cash", status: "paid", amount: 0, tax_amount: 0, ...o });

describe("expenses", () => {
  it("petty cash = approved top-ups minus paid petty expenses", () => {
    expect(pettyCashBalance([
      r({ entry_type: "petty_topup", status: "approved", amount: 10000 }),
      r({ payment_mode: "petty_cash", amount: 2500, tax_amount: 100 }),
      r({ payment_mode: "petty_cash", status: "approved", amount: 999 }),
      r({ payment_mode: "cash", amount: 5000 }),
    ])).toBe(7400);
  });
  it("drafts and rejected vouchers do not count as spending", () => {
    expect(spentTotal([r({ amount: 100 }), r({ status: "approved", amount: 50 }), r({ status: "draft", amount: 70 }), r({ status: "rejected", amount: 30 }), r({ entry_type: "petty_topup", amount: 900 })])).toBe(150);
  });
});
