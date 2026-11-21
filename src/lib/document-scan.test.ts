import { describe, expect, it } from "vitest";
import { applyPayment, buildChanges, isValidIsoDate } from "./document-scan";

describe("document scan rules", () => {
  it("update fills only empty fields", () => {
    const c = buildChanges({ first_name: "Ali", guardian_phone: null }, { first_name: "Aly", guardian_phone: "0300" }, ["first_name", "guardian_phone"], "update");
    expect(c).toEqual({ guardian_phone: "0300" });
  });
  it("replace overwrites existing values", () => {
    const c = buildChanges({ first_name: "Ali" }, { first_name: "Aly" }, ["first_name"], "replace");
    expect(c).toEqual({ first_name: "Aly" });
  });
  it("partial then full payment", () => {
    const ch = { gross_amount: 5000, discount_amount: 500, fine_amount: 0, paid_amount: 0 };
    expect(applyPayment(ch, 2000)?.status).toBe("partial");
    expect(applyPayment({ ...ch, paid_amount: 2000 }, 2500)).toEqual({ paid_amount: 4500, status: "paid", overpaid: 0 });
  });
  it("rejects zero payment and bad dates", () => {
    expect(applyPayment({ gross_amount: 1, discount_amount: 0, fine_amount: 0, paid_amount: 0 }, 0)).toBeNull();
    expect(isValidIsoDate("2026-02-30")).toBe(false);
  });
});
