export const EXPENSE_CATEGORIES = [
  { id: "utilities", label: "Utilities & Bills" },
  { id: "maintenance", label: "Campus Maintenance" },
  { id: "stationery", label: "Stationery & Printing" },
  { id: "labs_it", label: "Science Labs & IT" },
  { id: "transport", label: "Fuel & Transport" },
  { id: "refreshments", label: "Staff Refreshments" },
  { id: "events", label: "Events & Sports" },
  { id: "rent", label: "Rent" },
  { id: "salaries", label: "Salaries & Wages" },
  { id: "other", label: "Other" },
] as const;

export const PAYMENT_MODES = [
  { id: "cash", label: "Cash" },
  { id: "bank_transfer", label: "Bank Transfer" },
  { id: "cheque", label: "Cheque" },
  { id: "petty_cash", label: "Petty Cash" },
] as const;

export type ExpenseRow = {
  entry_type: string; payment_mode: string; status: string; amount: number; tax_amount: number;
};

export const expenseTotal = (r: Pick<ExpenseRow, "amount" | "tax_amount">) =>
  Math.round((Number(r.amount) + Number(r.tax_amount || 0)) * 100) / 100;

/** Petty cash balance = top-ups received − paid petty-cash expenses. */
export function pettyCashBalance(rows: ExpenseRow[]): number {
  let bal = 0;
  for (const r of rows) {
    if (r.entry_type === "petty_topup" && r.status !== "rejected" && r.status !== "draft") bal += expenseTotal(r);
    else if (r.entry_type === "expense" && r.payment_mode === "petty_cash" && r.status === "paid") bal -= expenseTotal(r);
  }
  return Math.round(bal * 100) / 100;
}

/** Only approved or paid expenses count as spending in the P&L. */
export function spentTotal(rows: ExpenseRow[]): number {
  return Math.round(rows.filter((r) => r.entry_type === "expense" && (r.status === "approved" || r.status === "paid"))
    .reduce((s, r) => s + expenseTotal(r), 0) * 100) / 100;
}

export const categoryLabel = (id: string) => EXPENSE_CATEGORIES.find((c) => c.id === id)?.label ?? id;
export const modeLabel = (id: string) => PAYMENT_MODES.find((c) => c.id === id)?.label ?? id;
