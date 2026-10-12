import { describe, it, expect } from "vitest";
import { parseStatement, parseBankDate, statementKey } from "./bank-statement";

describe("bank statement parser", () => {
  it("reads dd/mm/yyyy as day-first (Pakistani format)", () => {
    expect(parseBankDate("05/08/2025")).toBe("2025-08-05");
    expect(parseBankDate("05-Aug-2025")).toBe("2025-08-05");
  });
  it("keeps only credits and skips debits", () => {
    const csv = `Account: 123\nTxn Date,Narration,Debit,Credit\n05/08/2025,"CH-1001, tuition",,"15,000"\n06/08/2025,ATM withdrawal,500,`;
    const { rows, skipped } = parseStatement(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].amount).toBe(15000);
    expect(rows[0].description).toBe("CH-1001, tuition");
    expect(skipped).toBe(1);
  });
  it("gives identical rows the same fingerprint", () => {
    const r = { txn_date: "2025-08-05", reference: "tx1", description: "a", amount: 10 };
    expect(statementKey(r, null)).toBe(statementKey({ ...r }, null));
  });
});
