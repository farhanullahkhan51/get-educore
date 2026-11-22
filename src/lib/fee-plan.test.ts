import { describe, it, expect } from "vitest";
import { defaultFeePlan, planTotal } from "./fee-plan";

describe("inquiry fee plan", () => {
  const s = [
    { name: "Registration Fee", category: "other", amount: 1000 },
    { name: "Tuition", category: "tuition", amount: 5000 },
    { name: "Tuition Grade 7", category: "tuition", amount: 6500, class_id: "g7" },
    { name: "Security Deposit", category: "other", amount: 10000 },
    { name: "Annual Subscription", category: "other", amount: 3000 },
    { name: "Admission Fee", category: "admission", amount: 15000 },
  ];
  it("fills all five heads from the school's fee structure", () => {
    expect(defaultFeePlan(s)).toEqual({ registration: 1000, tuition: 5000, security: 10000, annual: 3000, admission: 15000 });
  });
  it("uses the grade's own tuition when there is one", () => {
    expect(defaultFeePlan(s, "g7").tuition).toBe(6500);
  });
  it("totals the plan", () => {
    expect(planTotal(defaultFeePlan(s))).toBe(34000);
  });
});
