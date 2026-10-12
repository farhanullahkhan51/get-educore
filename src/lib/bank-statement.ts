/** Parses Pakistani bank statement CSV exports (HBL, Meezan, UBL, MCB, Allied, generic). */
export type StatementRow = { txn_date: string; reference: string | null; description: string | null; amount: number };

export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { out.push(cur.trim()); cur = ""; }
    else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

const MONTHS: Record<string, string> = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };

export function parseBankDate(s: string): string | null {
  const v = s.trim();
  let m = v.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = v.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/); // dd/mm/yyyy (PK convention)
  if (m) { const y = m[3].length === 2 ? `20${m[3]}` : m[3]; return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; }
  m = v.match(/^(\d{1,2})[\s/-]([A-Za-z]{3})[A-Za-z]*[\s/-](\d{2,4})$/); // 05-Aug-2025
  if (m && MONTHS[m[2].toLowerCase()]) { const y = m[3].length === 2 ? `20${m[3]}` : m[3]; return `${y}-${MONTHS[m[2].toLowerCase()]}-${m[1].padStart(2, "0")}`; }
  return null;
}

export function parseAmount(s: string | undefined): number {
  if (!s) return 0;
  const neg = /^\(.*\)$/.test(s.trim()) || /dr$/i.test(s.trim());
  const n = Number(s.replace(/[^0-9.-]/g, ""));
  if (Number.isNaN(n)) return 0;
  return neg ? -Math.abs(n) : n;
}

const pick = (row: Record<string, string>, keys: string[]) => {
  for (const k of Object.keys(row)) if (keys.some((x) => k.includes(x)) && row[k]) return row[k];
  return "";
};

/** Returns only credit (incoming) rows; debits and invalid rows are skipped. */
export function parseStatement(text: string): { rows: StatementRow[]; skipped: number } {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  // find header line (banks often put account info above)
  const hIdx = lines.findIndex((l) => /date/i.test(l) && /(amount|credit|deposit)/i.test(l));
  if (hIdx < 0) return { rows: [], skipped: lines.length };
  const headers = splitCsvLine(lines[hIdx]).map((h) => h.toLowerCase());
  const rows: StatementRow[] = [];
  let skipped = 0;
  for (const line of lines.slice(hIdx + 1)) {
    const cells = splitCsvLine(line);
    const r: Record<string, string> = {};
    headers.forEach((h, i) => (r[h] = cells[i] ?? ""));
    const date = parseBankDate(pick(r, ["value date", "txn date", "transaction date", "date"]));
    const credit = pick(r, ["credit", "deposit", "cr"]);
    const amount = credit ? parseAmount(credit) : parseAmount(pick(r, ["amount"]));
    if (!date || !(amount > 0)) { skipped++; continue; }
    rows.push({
      txn_date: date,
      reference: pick(r, ["reference", "ref", "cheque", "instrument", "transaction id", "stan"]) || null,
      description: pick(r, ["description", "narration", "particular", "details", "remarks", "desc"]) || null,
      amount,
    });
  }
  return { rows, skipped };
}

/** Stable fingerprint so re-importing the same statement never duplicates rows. */
export function statementKey(r: StatementRow, accountId: string | null): string {
  return `stmt:${accountId ?? "any"}:${r.txn_date}:${(r.reference ?? "").toUpperCase()}:${r.amount.toFixed(2)}:${(r.description ?? "").toUpperCase().slice(0, 60)}`;
}
