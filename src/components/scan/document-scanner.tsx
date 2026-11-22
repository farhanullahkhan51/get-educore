import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Camera, CheckCircle2, Loader2, ScanLine, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  FIELD_KEYS,
  LOW_CONFIDENCE,
  applyPayment,
  buildChanges,
  isValidIsoDate,
  type DocKind,
  type ScanResult,
} from "@/lib/document-scan";

const KIND_LABEL: Record<DocKind, string> = {
  student: "Student document",
  staff: "Staff document",
  fee_receipt: "Fee receipt / challan",
  unknown: "Unrecognised document",
};

const LABELS: Record<string, string> = {
  student_code: "Student ID", staff_code: "Staff ID", first_name: "First name", last_name: "Last name",
  date_of_birth: "Date of birth", gender: "Gender", guardian_name: "Guardian name", guardian_phone: "Guardian phone",
  guardian_occupation: "Guardian occupation", address: "Address", phone: "Phone", email: "Email",
  designation: "Designation", department: "Department", qualification: "Qualification",
  date_of_joining: "Date of joining", challan_no: "Challan no.", amount_paid: "Amount paid",
  paid_on: "Paid on", bank_reference: "Bank reference",
};
const DATE_KEYS = new Set(["date_of_birth", "date_of_joining", "paid_on"]);

type Match = { id: string; label: string; row: Record<string, unknown> } | null;

/** Downscale to a sharp JPEG so text stays readable while upload stays small. */
async function toDataUrl(file: File): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", 0.92);
}

export function DocumentScanButton() {
  const { data: me } = useCurrentUser();
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [image, setImage] = useState<string | null>(null);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [kind, setKind] = useState<DocKind>("unknown");
  const [values, setValues] = useState<Record<string, string>>({});
  const [match, setMatch] = useState<Match>(null);
  const [confirmed, setConfirmed] = useState(false);

  if (!me || me.roles.every((r) => r === "student")) return null;

  async function findMatch(k: DocKind, v: Record<string, string>): Promise<Match> {
    if (k === "student") {
      let q = supabase.from("students").select("*").limit(2);
      if (v["student_code"]) q = q.eq("student_code", v["student_code"]);
      else if (v["first_name"] && v["last_name"]) q = q.ilike("first_name", v["first_name"]).ilike("last_name", v["last_name"]);
      else return null;
      const { data } = await q;
      if (data?.length !== 1) return null;
      const s = data[0]!;
      return { id: s.id, label: `${s.first_name} ${s.last_name} (${s.student_code})`, row: s };
    }
    if (k === "staff") {
      let q = supabase.from("staff").select("*").limit(2);
      if (v["staff_code"]) q = q.eq("staff_code", v["staff_code"]);
      else if (v["first_name"] && v["last_name"]) q = q.ilike("first_name", v["first_name"]).ilike("last_name", v["last_name"]);
      else return null;
      const { data } = await q;
      if (data?.length !== 1) return null;
      const s = data[0]!;
      return { id: s.id, label: `${s.first_name} ${s.last_name} (${s.staff_code})`, row: s };
    }
    if (k === "fee_receipt" && v["challan_no"]) {
      const { data } = await supabase
        .from("fee_challans")
        .select("*, students(first_name, last_name, student_code)")
        .eq("challan_no", v["challan_no"])
        .maybeSingle();
      if (!data) return null;
      const st = data.students as { first_name: string; last_name: string; student_code: string } | null;
      return { id: data.id, label: `${data.challan_no} · ${st ? `${st.first_name} ${st.last_name} (${st.student_code})` : ""} · ${data.status}`, row: data };
    }
    return null;
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) return toast.error("Please choose a photo (JPG, PNG or WebP).");
    setBusy(true);
    try {
      const dataUrl = await toDataUrl(file);
      const { data: s } = await supabase.auth.getSession();
      const res = await fetch("/api/scan-document", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${s.session?.access_token ?? ""}` },
        body: JSON.stringify({ image: dataUrl }),
      });
      if (!res.ok) throw new Error((await res.text()) || "Scan failed");
      const result = (await res.json()) as ScanResult;
      const v: Record<string, string> = {};
      for (const f of result.fields) v[f.key] = f.value;
      setImage(dataUrl);
      setScan(result);
      setKind(result.kind);
      setValues(v);
      setConfirmed(false);
      setMatch(await findMatch(result.kind, v));
      setOpen(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const keys = kind === "unknown" ? [] : FIELD_KEYS[kind];
  const conf = (k: string) => scan?.fields.find((f) => f.key === k)?.confidence;
  const lowFields = keys.filter((k) => values[k] && (conf(k) ?? 1) < LOW_CONFIDENCE);
  const badDates = keys.filter((k) => DATE_KEYS.has(k) && values[k] && !isValidIsoDate(values[k]!));
  const blocked = !scan?.legible || kind === "unknown" || badDates.length > 0 || !confirmed;

  async function save(mode: "create" | "update" | "replace") {
    if (blocked) return;
    setSaving(true);
    try {
      const clean: Record<string, string> = {};
      for (const k of keys) if (values[k]?.trim()) clean[k] = values[k]!.trim();
      if (kind === "fee_receipt") {
        if (!match) throw new Error("No matching challan found.");
        const row = match.row as { gross_amount: number; discount_amount: number; fine_amount: number; paid_amount: number; status: string };
        if (row.status === "paid" || row.status === "waived") throw new Error(`This challan is already ${row.status}.`);
        const pay = applyPayment(row, Number((clean["amount_paid"] ?? "").replace(/[^\d.]/g, "")));
        if (!pay) throw new Error("Amount paid is missing or invalid.");
        if (pay.overpaid > 0 && !window.confirm(`Receipt is ${pay.overpaid} more than the balance. Record as fully paid?`)) return;
        const note = `Scanned receipt${clean["bank_reference"] ? ` · ref ${clean["bank_reference"]}` : ""}`;
        const { error } = await supabase.from("fee_challans").update({
          paid_amount: pay.paid_amount, status: pay.status,
          paid_on: clean["paid_on"] ?? new Date().toISOString().slice(0, 10),
          notes: [String((match.row as { notes?: string | null }).notes ?? ""), note].filter(Boolean).join("\n"),
        }).eq("id", match.id);
        if (error) throw error;
      } else if (mode === "create") {
        if (!clean["first_name"] || !clean["last_name"]) throw new Error("First and last name are required.");
        let campusId = me!.campusId;
        if (!campusId) {
          const { data } = await supabase.from("campuses").select("id").limit(1).maybeSingle();
          campusId = data?.id ?? null;
        }
        if (!campusId) throw new Error("No campus available for this record.");
        const table = kind === "student" ? "students" : "staff";
        const codeKey = kind === "student" ? "student_code" : "staff_code";
        const scanned = clean[codeKey];
        const code = kind === "student"
          ? (scanned && /^\d{5}$/.test(String(scanned)) ? scanned : "")
          : scanned ?? `STF-${Date.now().toString(36).toUpperCase()}`;
        const payload = { ...clean, [codeKey]: code, campus_id: campusId, first_name: clean["first_name"], last_name: clean["last_name"] };
        const { error } = await (supabase.from(table) as unknown as { insert: (p: object) => Promise<{ error: Error | null }> }).insert(payload);
        if (error) throw error;
      } else {
        if (!match) throw new Error("No matching record found.");
        const changes = buildChanges(match.row, clean, keys.filter((k) => !k.endsWith("_code")), mode);
        if (Object.keys(changes).length === 0) throw new Error("Nothing to change — the record already has these values.");
        const table = kind === "student" ? "students" : "staff";
        const { error } = await (supabase.from(table) as unknown as { update: (p: object) => { eq: (c: string, v: string) => Promise<{ error: Error | null }> } }).update(changes).eq("id", match.id);
        if (error) throw error;
      }
      await supabase.from("audit_logs").insert({ action: `scan_${mode}`, entity_type: kind, entity_id: match?.id ?? null } as never).then(() => undefined, () => undefined);
      toast.success(mode === "create" ? "Record added" : kind === "fee_receipt" ? "Payment recorded" : "Record updated");
      qc.invalidateQueries();
      setOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <input ref={inputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => onFile(e.target.files?.[0])} />
      <Button variant="ghost" size="icon" aria-label="Scan a document" title="Scan a document" disabled={busy} onClick={() => inputRef.current?.click()}>
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ScanLine className="h-5 w-5" />}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Check the scan</DialogTitle>
            <DialogDescription>Compare every field with the photo before saving. Nothing is saved until you choose an action.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-5 md:grid-cols-2">
            <div className="space-y-2">
              {image && (
                <a href={image} target="_blank" rel="noreferrer" title="Open full size">
                  <img src={image} alt="Scanned document" className="w-full rounded-md border object-contain max-h-[65vh] bg-muted" />
                </a>
              )}
              <Button variant="outline" size="sm" className="w-full" onClick={() => inputRef.current?.click()} disabled={busy}>
                <Camera className="mr-2 h-4 w-4" /> Retake photo
              </Button>
            </div>

            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <Label className="text-xs text-muted-foreground">Document type</Label>
                <select className="rounded-md border bg-background px-2 py-1 text-sm" value={kind}
                  onChange={async (e) => { const k = e.target.value as DocKind; setKind(k); setMatch(await findMatch(k, values)); }}>
                  {(Object.keys(KIND_LABEL) as DocKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
                </select>
              </div>

              {!scan?.legible && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
                  <div className="flex items-center gap-2 font-medium text-destructive"><AlertTriangle className="h-4 w-4" /> Photo is not clear enough to save</div>
                  <ul className="mt-1 list-disc pl-5 text-muted-foreground">{scan?.qualityIssues.map((q) => <li key={q}>{q}</li>)}</ul>
                  <p className="mt-1">Retake in good light, flat, with the whole page in frame.</p>
                </div>
              )}
              {!!scan?.authenticityNotes.length && (
                <div className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm">
                  <div className="flex items-center gap-2 font-medium"><ShieldAlert className="h-4 w-4" /> Authenticity checks</div>
                  <ul className="mt-1 list-disc pl-5 text-muted-foreground">{scan.authenticityNotes.map((q) => <li key={q}>{q}</li>)}</ul>
                </div>
              )}

              <div className="rounded-md border p-3 text-sm">
                {match ? (
                  <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /> Matches: <strong>{match.label}</strong></div>
                ) : (
                  <div className="text-muted-foreground">No existing {kind === "fee_receipt" ? "challan" : "record"} matched.</div>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {keys.map((k) => {
                  const c = conf(k);
                  const low = !!values[k] && (c ?? 1) < LOW_CONFIDENCE;
                  const badDate = DATE_KEYS.has(k) && !!values[k] && !isValidIsoDate(values[k]!);
                  const existing = match?.row[k];
                  return (
                    <div key={k} className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <Label htmlFor={`scan-${k}`} className="text-xs">{LABELS[k] ?? k}</Label>
                        {c !== undefined && (
                          <Badge variant={low ? "destructive" : "secondary"} className="text-[10px]">{Math.round(c * 100)}%</Badge>
                        )}
                      </div>
                      <Input id={`scan-${k}`} value={values[k] ?? ""} placeholder={DATE_KEYS.has(k) ? "YYYY-MM-DD" : "Not found"}
                        className={low || badDate ? "border-destructive" : ""}
                        onChange={(e) => setValues((v) => ({ ...v, [k]: e.target.value }))} />
                      {badDate && <p className="text-[11px] text-destructive">Use a real date as YYYY-MM-DD.</p>}
                      {existing !== undefined && existing !== null && String(existing) !== "" && String(existing) !== (values[k] ?? "") && (
                        <p className="text-[11px] text-muted-foreground">On file: {String(existing)}</p>
                      )}
                    </div>
                  );
                })}
              </div>

              {lowFields.length > 0 && (
                <p className="text-xs text-destructive">{lowFields.length} field(s) in red were hard to read — check them carefully.</p>
              )}

              <label className="flex items-start gap-2 text-sm">
                <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} />
                I have checked every field against the photo and it is correct.
              </label>

              <div className="flex flex-wrap gap-2 border-t pt-3">
                {kind === "fee_receipt" ? (
                  <Button disabled={blocked || saving || !match} onClick={() => save("update")}>Record payment</Button>
                ) : kind !== "unknown" ? (
                  <>
                    <Button disabled={blocked || saving} variant={match ? "outline" : "default"} onClick={() => save("create")}>Enter as new</Button>
                    <Button disabled={blocked || saving || !match} onClick={() => save("update")} title="Fill only empty fields">Update (fill blanks)</Button>
                    <Button disabled={blocked || saving || !match} variant="destructive" onClick={() => save("replace")} title="Overwrite with scanned values">Replace</Button>
                  </>
                ) : null}
                <Button variant="ghost" onClick={() => setOpen(false)}>Cancel</Button>
                {saving && <Loader2 className="h-4 w-4 animate-spin self-center" />}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
