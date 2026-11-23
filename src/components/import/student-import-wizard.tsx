import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { parseCsv } from "@/lib/csv";
import {
  IMPORT_FIELD_KEYS, SCHOOL_STUDENT_HEADERS, guessMapping, remapRow, type ImportFieldKey,
} from "@/lib/student-import";

const SKIP = "__skip";
const labelOf = (k: ImportFieldKey) => SCHOOL_STUDENT_HEADERS[IMPORT_FIELD_KEYS.indexOf(k)]!;

function cellText(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) {
    const d = String(v.getUTCDate()).padStart(2, "0");
    const m = String(v.getUTCMonth() + 1).padStart(2, "0");
    return `${d}/${m}/${v.getUTCFullYear()}`;
  }
  return String(v).trim();
}

async function readFile(file: File): Promise<string[][]> {
  if (/\.xlsx$/i.test(file.name)) {
    const { readSheet } = await import("read-excel-file/browser");
    const data = await readSheet(file);
    return data.map((r) => r.map(cellText));
  }
  if (/\.xls$/i.test(file.name)) throw new Error("Old .xls files aren't supported — in Excel use Save As → Excel Workbook (.xlsx).");
  return parseCsv(await file.text());
}

/** Upload an Excel/CSV file as-is, match its columns to EduCore fields, then import. */
export function StudentImportWizard({ busy, onImport }: { busy: boolean; onImport: (rows: Record<string, string>[]) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [headers, setHeaders] = useState<string[]>([]);
  const [rows, setRows] = useState<string[][]>([]);
  const [mapping, setMapping] = useState<(ImportFieldKey | null)[]>([]);
  const [drag, setDrag] = useState(false);
  const [reading, setReading] = useState(false);

  async function load(file: File) {
    setReading(true);
    try {
      const all = (await readFile(file)).filter((r) => r.some((c) => c !== ""));
      // Header row = first row within the top 10 that matches at least two fields.
      let hi = all.findIndex((r, i) => i < 10 && guessMapping(r).filter(Boolean).length >= 2);
      if (hi < 0) hi = 0;
      const head = (all[hi] ?? []).map((h, i) => h || `Column ${i + 1}`);
      const body = all.slice(hi + 1);
      if (body.length === 0) { toast.error("No student rows found in that file."); return; }
      setFileName(file.name); setHeaders(head); setRows(body); setMapping(guessMapping(head));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't read that file.");
    } finally { setReading(false); }
  }

  function setCol(i: number, v: string) {
    setMapping((m) => m.map((k, j) => (j === i ? (v === SKIP ? null : (v as ImportFieldKey)) : k === v ? null : k)));
  }

  function reset() { setFileName(""); setHeaders([]); setRows([]); setMapping([]); }

  const hasName = mapping.includes("student_name");

  if (headers.length === 0) {
    return (
      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) void load(f); }}
        className={`flex flex-col items-center gap-2 rounded-md border-2 border-dashed px-4 py-8 text-center transition-colors ${drag ? "border-primary bg-primary/5" : "border-border"}`}
      >
        <input ref={ref} type="file" accept=".xlsx,.csv,text/csv" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void load(f); }} />
        <Upload className="h-6 w-6 text-muted-foreground" />
        <p className="text-sm font-medium">Drop your own student file here — Excel (.xlsx) or CSV</p>
        <p className="text-xs text-muted-foreground">No template needed. You'll match your columns on the next step.</p>
        <Button size="sm" variant="outline" disabled={reading || busy} onClick={() => ref.current?.click()}>
          {reading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />} Choose file
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm"><span className="font-medium">{fileName}</span> · {rows.length} rows · match each column below</p>
        <Button size="sm" variant="ghost" onClick={reset} disabled={busy}><X className="mr-1 h-4 w-4" /> Change file</Button>
      </div>
      <div className="max-h-[420px] overflow-auto rounded-md border">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-muted text-left text-xs">
            <tr><th className="px-3 py-2">Your column</th><th className="px-3 py-2">EduCore field</th><th className="px-3 py-2">Sample from your file</th></tr>
          </thead>
          <tbody>
            {headers.map((h, i) => (
              <tr key={i} className="border-t">
                <td className="px-3 py-1.5 font-medium">{h}</td>
                <td className="px-3 py-1.5">
                  <Select value={mapping[i] ?? SKIP} onValueChange={(v) => setCol(i, v)}>
                    <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SKIP}>Skip this column</SelectItem>
                      {IMPORT_FIELD_KEYS.map((k) => <SelectItem key={k} value={k}>{labelOf(k)}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </td>
                <td className={`px-3 py-1.5 text-xs ${mapping[i] ? "" : "text-muted-foreground line-through"}`}>
                  {rows.slice(0, 2).map((r) => r[i] ?? "").filter(Boolean).join(" · ") || "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Missing Adm. IDs are numbered automatically. Missing Adm. Dates use today. Classes and sections must already exist with the same names.
      </p>
      <Button disabled={busy || !hasName} onClick={() => onImport(rows.map((r) => remapRow(r, mapping)))}>
        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {hasName ? `Import ${rows.length} students` : "Pick which column is Student Name"}
      </Button>
    </div>
  );
}
