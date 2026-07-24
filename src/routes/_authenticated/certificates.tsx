import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Award, Plus, Printer, Ban, Search, Eye, Pencil, Trash2 } from "lucide-react";
import { useTenantId, getActiveTenantName } from "@/lib/tenant-context";

export const Route = createFileRoute("/_authenticated/certificates")({
  component: CertificatesPage,
});

type CertType =
  | "character" | "bonafide" | "school_leaving" | "transfer" | "provisional"
  | "passing" | "participation" | "merit" | "experience" | "custom";
type CertStatus = "draft" | "issued" | "revoked";

type Certificate = {
  id: string; tenant_id: string; campus_id: string;
  student_id: string | null; staff_id: string | null;
  recipient_name: string; recipient_ref: string | null;
  type: CertType; title: string; serial_no: string;
  issue_date: string; body: string; remarks: string | null;
  status: CertStatus; revoked_at: string | null; revoke_reason: string | null;
  created_at: string;
};

const TYPE_LABEL: Record<CertType, string> = {
  character: "Character Certificate",
  bonafide: "Bonafide Certificate",
  school_leaving: "School Leaving Certificate",
  transfer: "Transfer Certificate",
  provisional: "Provisional Certificate",
  passing: "Passing Certificate",
  participation: "Participation Certificate",
  merit: "Merit Certificate",
  experience: "Experience Letter",
  custom: "Custom Document",
};

const STUDENT_TYPES: CertType[] = ["character", "bonafide", "school_leaving", "transfer", "provisional", "passing", "participation", "merit"];
const STAFF_TYPES: CertType[] = ["experience"];

function defaultBody(t: CertType, name: string, ref: string, extra: { campus?: string; grade?: string; dob?: string; date?: string }): string {
  const on = extra.date ?? new Date().toISOString().slice(0, 10);
  const c = extra.campus ?? "this institution";
  switch (t) {
    case "character":
      return `This is to certify that ${name} (ID: ${ref}) has been a student of ${c}. During ${his_her()} tenure, ${his_her(true)} conduct and character remained excellent. To the best of our knowledge, ${he_she()} bears a good moral character and has not been involved in any objectionable activity.\n\nWe wish ${him_her()} the very best for future endeavours.`;
    case "bonafide":
      return `This is to certify that ${name} (ID: ${ref}) is a bonafide student of ${c}${extra.grade ? `, currently studying in ${extra.grade}` : ""}. This certificate is issued on ${he_she()}r request for official purposes.`;
    case "school_leaving":
      return `This is to certify that ${name} (ID: ${ref})${extra.dob ? `, date of birth ${extra.dob},` : ""} was a student of ${c}${extra.grade ? ` up to ${extra.grade}` : ""}. ${his_her(true).charAt(0).toUpperCase() + his_her(true).slice(1)} conduct and progress during the period of studies was satisfactory. No dues are outstanding against ${him_her()} as of ${on}.`;
    case "transfer":
      return `This is to certify that ${name} (ID: ${ref}) has been struck off the rolls of ${c} with effect from ${on}${extra.grade ? ` from ${extra.grade}` : ""}. ${his_her(true).charAt(0).toUpperCase() + his_her(true).slice(1)} character and conduct during the stay in this institution was good.`;
    case "provisional":
      return `This is to certify that ${name} (ID: ${ref}) has appeared in the final examination${extra.grade ? ` of ${extra.grade}` : ""} conducted by ${c} and has fulfilled all the requirements. This provisional certificate is issued pending the issuance of the formal result / degree.`;
    case "passing":
      return `This is to certify that ${name} (ID: ${ref}) has successfully passed${extra.grade ? ` ${extra.grade}` : ""} from ${c}. We congratulate ${him_her()} on this achievement.`;
    case "participation":
      return `This is to certify that ${name} (ID: ${ref}) actively participated in the event / activity organised by ${c}. We appreciate ${his_her()} enthusiasm and contribution.`;
    case "merit":
      return `This is to certify that ${name} (ID: ${ref}) has demonstrated outstanding academic performance${extra.grade ? ` in ${extra.grade}` : ""} at ${c}. This merit certificate is awarded in recognition of ${his_her()} exemplary achievement.`;
    case "experience":
      return `This is to certify that ${name} (ID: ${ref}) has served ${c} in a professional capacity. During the tenure, ${his_her(true)} performance, conduct and dedication were commendable. We wish ${him_her()} success in future assignments.`;
    default:
      return `This document is issued in favour of ${name} (ID: ${ref}) by ${c} on ${on}.`;
  }
}
function his_her(possessive = false) { return possessive ? "his/her" : "his/her"; }
function he_she() { return "he/she"; }
function him_her() { return "him/her"; }

function CertificatesPage() {
  const tenantId = useTenantId();
  const [open, setOpen] = useState(false);
  const [viewing, setViewing] = useState<Certificate | null>(null);
  const [editing, setEditing] = useState<Certificate | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editSerial, setEditSerial] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editRemarks, setEditRemarks] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  // form state
  const [type, setType] = useState<CertType>("character");
  const [campusId, setCampusId] = useState<string>("");
  const [studentId, setStudentId] = useState<string>("");
  const [staffId, setStaffId] = useState<string>("");
  const [title, setTitle] = useState<string>("");
  const [serialNo, setSerialNo] = useState<string>("");
  const [issueDate, setIssueDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [body, setBody] = useState<string>("");
  const [remarks, setRemarks] = useState<string>("");

  const { data: campuses } = useQuery({
    queryKey: ["campuses-for-cert"],
    queryFn: async () => (await supabase.from("campuses").select("id,name")).data ?? [],
  });
  const { data: students } = useQuery({
    queryKey: ["students-for-cert"],
    queryFn: async () => (await supabase.from("students")
      .select("id,first_name,last_name,student_code,campus_id,grade,date_of_birth,guardian_name").order("first_name")).data ?? [],
  });
  const { data: staff } = useQuery({
    queryKey: ["staff-for-cert"],
    queryFn: async () => (await supabase.from("staff")
      .select("id,first_name,last_name,staff_code,campus_id,designation").order("first_name")).data ?? [],
  });
  const { data: certificates, refetch } = useQuery({
    queryKey: ["certificates"],
    queryFn: async () => (await supabase.from("certificates")
      .select("*").order("created_at", { ascending: false })).data as Certificate[] ?? [],
  });

  const isStudentCert = STUDENT_TYPES.includes(type);
  const isStaffCert = STAFF_TYPES.includes(type);

  const selectedStudent = useMemo(() => students?.find((s) => s.id === studentId), [students, studentId]);
  const selectedStaff = useMemo(() => staff?.find((s) => s.id === staffId), [staff, staffId]);
  const selectedCampus = useMemo(() => campuses?.find((c) => c.id === campusId), [campuses, campusId]);

  function generateSerial(t: CertType) {
    const prefix: Record<CertType, string> = {
      character: "CHR", bonafide: "BON", school_leaving: "SLC", transfer: "TC", provisional: "PRO",
      passing: "PSC", participation: "PAR", merit: "MER", experience: "EXP", custom: "DOC",
    };
    const y = new Date().getFullYear();
    const n = String(Math.floor(1000 + Math.random() * 9000));
    return `${prefix[t]}/${y}/${n}`;
  }

  function reset() {
    setType("character"); setCampusId(""); setStudentId(""); setStaffId("");
    setTitle(""); setSerialNo(""); setIssueDate(new Date().toISOString().slice(0, 10));
    setBody(""); setRemarks("");
  }

  function autofillFromType(t: CertType) {
    setType(t);
    setTitle(TYPE_LABEL[t].toUpperCase());
    setSerialNo(generateSerial(t));
    // clear opposite side
    if (STUDENT_TYPES.includes(t)) setStaffId("");
    if (STAFF_TYPES.includes(t)) setStudentId("");
  }

  function regenerateBody() {
    if (isStudentCert && selectedStudent) {
      setBody(defaultBody(type,
        `${selectedStudent.first_name} ${selectedStudent.last_name}`,
        selectedStudent.student_code,
        {
          campus: selectedCampus?.name,
          grade: selectedStudent.grade ?? undefined,
          dob: selectedStudent.date_of_birth ?? undefined,
          date: issueDate,
        }));
    } else if (isStaffCert && selectedStaff) {
      setBody(defaultBody(type,
        `${selectedStaff.first_name} ${selectedStaff.last_name}`,
        selectedStaff.staff_code,
        { campus: selectedCampus?.name, date: issueDate }));
    } else if (type === "custom") {
      setBody("");
    }
  }

  async function submit() {
    if (!tenantId) return toast.error("Tenant not resolved");
    if (!campusId) return toast.error("Select a campus");
    if (isStudentCert && !studentId) return toast.error("Select a student");
    if (isStaffCert && !staffId) return toast.error("Select a staff member");
    if (!title.trim()) return toast.error("Title is required");
    if (!serialNo.trim()) return toast.error("Serial number is required");
    if (!body.trim()) return toast.error("Body content is required");

    const recipient_name = isStudentCert && selectedStudent
      ? `${selectedStudent.first_name} ${selectedStudent.last_name}`
      : isStaffCert && selectedStaff
      ? `${selectedStaff.first_name} ${selectedStaff.last_name}`
      : "";
    const recipient_ref = isStudentCert
      ? selectedStudent?.student_code ?? null
      : isStaffCert
      ? selectedStaff?.staff_code ?? null
      : null;

    if (!recipient_name) return toast.error("Recipient is required");

    const { data: userData } = await supabase.auth.getUser();
    const { error } = await supabase.from("certificates").insert({
      tenant_id: tenantId,
      campus_id: campusId,
      student_id: isStudentCert ? studentId : null,
      staff_id: isStaffCert ? staffId : null,
      recipient_name,
      recipient_ref,
      type,
      title: title.trim(),
      serial_no: serialNo.trim(),
      issue_date: issueDate,
      body: body.trim(),
      remarks: remarks.trim() || null,
      issued_by: userData.user?.id ?? null,
      status: "issued",
    });
    if (error) return toast.error(error.message);
    toast.success("Certificate issued");
    setOpen(false); reset(); refetch();
  }

  async function revoke(c: Certificate) {
    const reason = window.prompt("Reason for revocation?");
    if (!reason) return;
    const { error } = await supabase.from("certificates").update({
      status: "revoked", revoked_at: new Date().toISOString(), revoke_reason: reason,
    }).eq("id", c.id);
    if (error) return toast.error(error.message);
    toast.success("Certificate revoked");
    refetch();
  }

  function printCert(c: Certificate) {
    const campus = campuses?.find((x) => x.id === c.campus_id);
    const w = window.open("", "_blank", "width=900,height=1100");
    if (!w) return;
    const bodyHtml = c.body.split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, "<br/>")}</p>`).join("");
    const watermark = c.status === "revoked"
      ? `<div class="wm">REVOKED</div>` : "";
    w.document.write(`<!doctype html><html><head><title>${c.title} - ${c.recipient_name}</title>
      <meta name="color-scheme" content="light only">
      <style>
        :root { color-scheme: light; }
        html, body { background:#fff !important; color:#111 !important; }
        body { font-family: Georgia, 'Times New Roman', serif; padding: 60px 72px; position: relative; }
        .frame { border: 6px double #1f2a44; padding: 40px 48px; position: relative; min-height: 900px; }
        .frame::before { content:""; position:absolute; inset:8px; border:1px solid #cbd5e1; pointer-events:none; }
        .head { text-align:center; border-bottom: 2px solid #1f2a44; padding-bottom: 16px; margin-bottom: 22px; }
        .head .brand { font-size: 11px; letter-spacing: 6px; text-transform: uppercase; color:#475569; }
        .head h1 { margin: 6px 0 4px; font-size: 28px; letter-spacing: 4px; color:#0f172a; }
        .head .campus { font-size: 13px; color:#334155; letter-spacing: 2px; text-transform: uppercase; }
        .title { text-align:center; margin: 24px 0 18px; font-size: 22px; letter-spacing: 6px; color:#0f172a; text-transform: uppercase; }
        .meta { display:flex; justify-content: space-between; font-size: 12px; color:#475569; margin-bottom: 18px; }
        .body { font-size: 15px; line-height: 1.9; color:#0f172a; text-align: justify; }
        .body p { margin: 0 0 14px; }
        .remarks { margin-top: 18px; font-size: 12px; color:#475569; font-style: italic; }
        .sig { margin-top: 90px; display:flex; justify-content: space-between; font-size: 12px; }
        .sig div { border-top: 1px solid #0f172a; padding-top: 6px; width: 30%; text-align:center; color:#0f172a; }
        .foot { margin-top: 40px; text-align:center; font-size: 10px; color:#64748b; letter-spacing: 2px; text-transform: uppercase; }
        .wm { position: absolute; top: 40%; left: 0; right: 0; text-align: center; font-size: 120px; letter-spacing: 20px; color: rgba(220,38,38,0.18); transform: rotate(-18deg); pointer-events:none; font-weight: 800; }
        @media print { * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } }
      </style></head><body>
      <div class="frame">
        ${watermark}
        <div class="head">
          <div class="brand">${getActiveTenantName()}</div>
          <h1>${campus?.name ?? ""}</h1>
          <div class="campus">Office of the Principal</div>
        </div>
        <div class="title">${c.title}</div>
        <div class="meta">
          <div><b>Serial No:</b> ${c.serial_no}</div>
          <div><b>Date of Issue:</b> ${new Date(c.issue_date).toLocaleDateString()}</div>
        </div>
        <div class="body">${bodyHtml}</div>
        ${c.remarks ? `<div class="remarks"><b>Remarks:</b> ${c.remarks}</div>` : ""}
        <div class="sig">
          <div>Registrar</div>
          <div>Head of Institution</div>
          <div>Official Seal</div>
        </div>
        <div class="foot">This is a computer-generated certificate. Verify with serial no. ${c.serial_no} · ${getActiveTenantName()}</div>
      </div>
      </body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 400);
  }

  const filtered = useMemo(() => {
    let list = certificates ?? [];
    if (typeFilter !== "all") list = list.filter((c) => c.type === typeFilter);
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((c) =>
      c.recipient_name.toLowerCase().includes(q) ||
      c.serial_no.toLowerCase().includes(q) ||
      (c.recipient_ref ?? "").toLowerCase().includes(q) ||
      c.title.toLowerCase().includes(q));
    return list;
  }, [certificates, typeFilter, search]);

  const campusName = (id: string) => campuses?.find((c) => c.id === id)?.name ?? "—";

  return (
    <>
      <PageHeader
        eyebrow="Documents"
        title="Certificates"
        description="Issue, track and reprint bonafide, character, leaving, transfer and merit certificates. Every document carries a unique serial for verification."
        actions={
          <Button onClick={() => { reset(); setOpen(true); }}>
            <Plus className="mr-1 h-4 w-4" /> New Certificate
          </Button>
        }
      />

      <Card className="shadow-none mb-4">
        <CardContent className="flex flex-wrap items-center gap-3 p-3">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search recipient, serial no, or title" className="pl-8"
              value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {(Object.keys(TYPE_LABEL) as CertType[]).map((t) => (
                <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Serial</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Recipient</TableHead>
                <TableHead>Campus</TableHead>
                <TableHead>Issued</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow><TableCell colSpan={7} className="py-10 text-center text-sm text-muted-foreground">
                  <Award className="mx-auto mb-2 h-6 w-6 opacity-50" />
                  No certificates issued yet.
                </TableCell></TableRow>
              )}
              {filtered.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-mono text-xs">{c.serial_no}</TableCell>
                  <TableCell className="text-sm">{TYPE_LABEL[c.type]}</TableCell>
                  <TableCell>
                    <div className="text-sm font-medium">{c.recipient_name}</div>
                    <div className="text-xs text-muted-foreground">{c.recipient_ref ?? "—"}</div>
                  </TableCell>
                  <TableCell className="text-sm">{campusName(c.campus_id)}</TableCell>
                  <TableCell className="text-sm">{new Date(c.issue_date).toLocaleDateString()}</TableCell>
                  <TableCell>
                    {c.status === "issued" && <Badge variant="secondary">Issued</Badge>}
                    {c.status === "revoked" && <Badge variant="destructive">Revoked</Badge>}
                    {c.status === "draft" && <Badge variant="outline">Draft</Badge>}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => setViewing(c)}>View</Button>
                    <Button variant="ghost" size="sm" onClick={() => printCert(c)}>
                      <Printer className="h-4 w-4" />
                    </Button>
                    {c.status !== "revoked" && (
                      <Button variant="ghost" size="sm" onClick={() => revoke(c)}>
                        <Ban className="h-4 w-4 text-destructive" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Create dialog */}
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Issue new certificate</DialogTitle>
            <DialogDescription>Pick a template, fill the recipient and preview the body. You can edit the text before saving.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Certificate type *</Label>
                <Select value={type} onValueChange={(v: CertType) => autofillFromType(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TYPE_LABEL) as CertType[]).map((t) => (
                      <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Campus *</Label>
                <Select value={campusId} onValueChange={setCampusId}>
                  <SelectTrigger><SelectValue placeholder="Select campus" /></SelectTrigger>
                  <SelectContent>
                    {campuses?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {isStudentCert && (
              <div className="space-y-2">
                <Label>Student *</Label>
                <Select value={studentId} onValueChange={setStudentId}>
                  <SelectTrigger><SelectValue placeholder="Select student" /></SelectTrigger>
                  <SelectContent>
                    {students?.filter((s) => !campusId || s.campus_id === campusId).map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.first_name} {s.last_name} · {s.student_code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {isStaffCert && (
              <div className="space-y-2">
                <Label>Staff *</Label>
                <Select value={staffId} onValueChange={setStaffId}>
                  <SelectTrigger><SelectValue placeholder="Select staff member" /></SelectTrigger>
                  <SelectContent>
                    {staff?.filter((s) => !campusId || s.campus_id === campusId).map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.first_name} {s.last_name} · {s.staff_code}{s.designation ? ` · ${s.designation}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="space-y-2 md:col-span-2">
                <Label>Title *</Label>
                <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="CHARACTER CERTIFICATE" />
              </div>
              <div className="space-y-2">
                <Label>Issue date *</Label>
                <Input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Serial number *</Label>
                <div className="flex gap-2">
                  <Input value={serialNo} onChange={(e) => setSerialNo(e.target.value)} />
                  <Button type="button" variant="outline" onClick={() => setSerialNo(generateSerial(type))}>Auto</Button>
                </div>
              </div>
              <div className="space-y-2 flex flex-col justify-end">
                <Button type="button" variant="outline" onClick={regenerateBody}>
                  Fill body from template
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Body *</Label>
              <Textarea rows={10} value={body} onChange={(e) => setBody(e.target.value)}
                placeholder="Write the certificate content. Blank lines create paragraphs." />
            </div>
            <div className="space-y-2">
              <Label>Remarks</Label>
              <Input value={remarks} onChange={(e) => setRemarks(e.target.value)}
                placeholder="Optional note printed below the body" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit}>Issue certificate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* View dialog */}
      <Dialog open={!!viewing} onOpenChange={(o) => { if (!o) setViewing(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{viewing?.title}</DialogTitle>
            <DialogDescription>
              Serial <span className="font-mono">{viewing?.serial_no}</span> · Issued {viewing ? new Date(viewing.issue_date).toLocaleDateString() : ""}
            </DialogDescription>
          </DialogHeader>
          {viewing && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-muted-foreground">Recipient:</span> {viewing.recipient_name} ({viewing.recipient_ref ?? "—"})</div>
                <div><span className="text-muted-foreground">Campus:</span> {campusName(viewing.campus_id)}</div>
                <div><span className="text-muted-foreground">Type:</span> {TYPE_LABEL[viewing.type]}</div>
                <div><span className="text-muted-foreground">Status:</span> {viewing.status}</div>
              </div>
              <div className="rounded border bg-muted/30 p-4 whitespace-pre-wrap leading-relaxed">
                {viewing.body}
              </div>
              {viewing.remarks && <div className="text-xs italic text-muted-foreground">Remarks: {viewing.remarks}</div>}
              {viewing.status === "revoked" && (
                <div className="rounded border border-destructive/40 bg-destructive/10 p-3 text-xs">
                  <b>Revoked</b> {viewing.revoked_at ? `on ${new Date(viewing.revoked_at).toLocaleDateString()}` : ""}
                  {viewing.revoke_reason ? ` — ${viewing.revoke_reason}` : ""}
                </div>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setViewing(null)}>Close</Button>
            {viewing && (
              <Button onClick={() => printCert(viewing)}>
                <Printer className="mr-1 h-4 w-4" /> Print
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
