import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EditableTabs } from "@/components/layout/editable";
import { toast } from "sonner";
import { Phone, Mail, MapPin, Clock, ArrowRight, UserPlus, Search, ExternalLink } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { generateCode } from "@/lib/generate-code";
import { useCurrentUser } from "@/hooks/use-current-user";
import { FeatureGate } from "@/components/layout/feature-gate";

export const Route = createFileRoute("/_authenticated/admissions")({
  component: GatedAdmissionsPage,
});

type Status = "new" | "contacted" | "visited" | "converted" | "lost";
type AcademicSystem = "board" | "cambridge" | "both";

type Inquiry = {
  id: string;
  campus_id: string | null;
  program_id: string | null;
  academic_system: AcademicSystem | null;
  student_name: string;
  student_dob: string | null;
  student_gender: string | null;
  previous_school: string | null;
  grade_applying_for: string | null;
  guardian_name: string;
  guardian_relation: string | null;
  guardian_phone: string;
  guardian_email: string | null;
  address: string | null;
  notes: string | null;
  source: string | null;
  status: Status;
  assigned_to: string | null;
  converted_student_id: string | null;
  converted_at: string | null;
  created_at: string;
};

const COLUMNS: { status: Status; label: string; hint: string }[] = [
  { status: "new", label: "New", hint: "Just submitted — needs first contact" },
  { status: "contacted", label: "Contacted", hint: "Reached out; awaiting response" },
  { status: "visited", label: "Visited", hint: "Toured the campus or attended interview" },
  { status: "converted", label: "Converted", hint: "Enrolled as student" },
  { status: "lost", label: "Lost", hint: "Did not proceed" },
];

const STATUS_STYLES: Record<Status, string> = {
  new: "bg-primary/10 text-primary border-primary/20",
  contacted: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  visited: "bg-blue-500/10 text-blue-700 border-blue-500/20",
  converted: "bg-emerald-600/10 text-emerald-700 border-emerald-600/20",
  lost: "bg-muted text-muted-foreground border-border",
};

const HEADER_STYLES: Record<Status, string> = {
  new: "bg-gray-200 text-gray-900",
  contacted: "bg-orange-100 text-orange-900",
  visited: "bg-blue-100 text-blue-900",
  converted: "bg-green-100 text-green-900",
  lost: "bg-red-100 text-red-900",
};

const HEADER_HINT_STYLES: Record<Status, string> = {
  new: "text-gray-600",
  contacted: "text-orange-700",
  visited: "text-blue-700",
  converted: "text-green-700",
  lost: "text-red-700",
};

function AdmissionsPage() {
  const qc = useQueryClient();
  const { data: user } = useCurrentUser();
  const [search, setSearch] = useState("");
  const [campusFilter, setCampusFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Inquiry | null>(null);
  const [convertOpen, setConvertOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);

  const { data: campuses } = useQuery({
    queryKey: ["campuses"],
    queryFn: async () => (await supabase.from("campuses").select("id, name, academic_system").order("name")).data ?? [],
  });

  const { data: inquiries, isLoading } = useQuery({
    queryKey: ["inquiries"],
    queryFn: async () => {
      const { data, error } = await supabase.from("inquiries").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data as Inquiry[];
    },
  });

  const campusMap = useMemo(() => new Map(campuses?.map((c) => [c.id, c.name])), [campuses]);

  const filtered = useMemo(() => {
    let list = inquiries ?? [];
    if (campusFilter !== "all") list = list.filter((i) => i.campus_id === campusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (i) =>
          i.student_name.toLowerCase().includes(q) ||
          i.guardian_name.toLowerCase().includes(q) ||
          i.guardian_phone.includes(q) ||
          (i.guardian_email ?? "").toLowerCase().includes(q),
      );
    }
    return list;
  }, [inquiries, campusFilter, search]);

  const grouped = useMemo(() => {
    const map: Record<Status, Inquiry[]> = { new: [], contacted: [], visited: [], converted: [], lost: [] };
    for (const i of filtered) map[i.status].push(i);
    return map;
  }, [filtered]);

  async function updateStatus(id: string, status: Status) {
    const { error } = await supabase.from("inquiries").update({ status }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(`Moved to ${status}`);
    qc.invalidateQueries({ queryKey: ["inquiries"] });
  }

  const totalNew = grouped.new.length;
  const totalActive = grouped.new.length + grouped.contacted.length + grouped.visited.length;
  const conversionRate = (() => {
    const decided = grouped.converted.length + grouped.lost.length;
    if (decided === 0) return null;
    return Math.round((grouped.converted.length / decided) * 100);
  })();

  return (
    <>
      <PageHeader
        eyebrow="Admissions"
        title="Inquiry pipeline"
        description="Every prospective family, from first inquiry through enrollment."
        actions={
          <Button onClick={() => setNewOpen(true)}>
            <UserPlus className="mr-1 h-4 w-4" /> Log inquiry
          </Button>
        }
      />

      <div className="mb-6 grid gap-4 md:grid-cols-4">
        <StatCard label="New" value={totalNew} hint="Awaiting first contact" />
        <StatCard label="Active pipeline" value={totalActive} hint="Not yet decided" />
        <StatCard label="Converted" value={grouped.converted.length} hint="Became students" />
        <StatCard label="Conversion rate" value={conversionRate === null ? "—" : `${conversionRate}%`} hint="Converted ÷ decided" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px] max-w-sm">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="Search name, phone, email…" className="pl-8" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={campusFilter} onValueChange={setCampusFilter}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All campuses</SelectItem>
            {campuses?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <EditableTabs scope="module:admissions" fallback="board">

        <TabsContent value="board" className="mt-4">
          <div className="grid gap-4 xl:grid-cols-5 md:grid-cols-2">
            {COLUMNS.map((col) => (
              <div key={col.status} className="rounded-md border border-border bg-card/40">
                <div className={`border-b border-border px-3 py-2.5 ${HEADER_STYLES[col.status]}`}>
                  <div className="flex items-center justify-between">
                    <div className="text-sm font-semibold">{col.label}</div>
                    <Badge variant="outline" className={STATUS_STYLES[col.status]}>{grouped[col.status].length}</Badge>
                  </div>
                  <p className={`mt-0.5 text-xs ${HEADER_HINT_STYLES[col.status]}`}>{col.hint}</p>
                </div>
                <div className="space-y-2 p-2 min-h-[200px]">
                  {isLoading && <p className="p-3 text-xs text-muted-foreground">Loading…</p>}
                  {!isLoading && grouped[col.status].length === 0 && (
                    <p className="p-3 text-xs text-muted-foreground">No inquiries here.</p>
                  )}
                  {grouped[col.status].map((inq) => (
                    <InquiryCard
                      key={inq.id}
                      inq={inq}
                      campusName={inq.campus_id ? campusMap.get(inq.campus_id) : null}
                      onSelect={() => setSelected(inq)}
                      onMove={(s) => updateStatus(inq.id, s)}
                      onConvert={() => { setSelected(inq); setConvertOpen(true); }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="table" className="mt-4">
          <Card className="shadow-none">
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {filtered.map((inq) => (
                  <button
                    key={inq.id}
                    onClick={() => setSelected(inq)}
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/40"
                  >
                    <div>
                      <div className="font-medium">{inq.student_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {inq.guardian_name} · {inq.guardian_phone}
                        {inq.campus_id && <> · {campusMap.get(inq.campus_id)}</>}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(inq.created_at), { addSuffix: true })}
                      </span>
                      <Badge variant="outline" className={STATUS_STYLES[inq.status]}>{inq.status}</Badge>
                    </div>
                  </button>
                ))}
                {filtered.length === 0 && (
                  <div className="p-8 text-center text-sm text-muted-foreground">No inquiries match your filters.</div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </EditableTabs>

      <InquiryDetailDialog
        inquiry={selected}
        open={!!selected && !convertOpen}
        campusName={selected?.campus_id ? campusMap.get(selected.campus_id) ?? null : null}
        onClose={() => setSelected(null)}
        onMove={(s) => selected && updateStatus(selected.id, s)}
        onConvert={() => setConvertOpen(true)}
      />

      <ConvertDialog
        inquiry={selected}
        open={convertOpen}
        onClose={() => { setConvertOpen(false); }}
        onDone={() => { setConvertOpen(false); setSelected(null); qc.invalidateQueries({ queryKey: ["inquiries"] }); qc.invalidateQueries({ queryKey: ["students"] }); }}
      />

      <NewInquiryDialog
        open={newOpen}
        onClose={() => setNewOpen(false)}
        campuses={campuses ?? []}
        defaultCampusId={user?.campusId ?? null}
        onDone={() => { setNewOpen(false); qc.invalidateQueries({ queryKey: ["inquiries"] }); }}
      />
    </>
  );
}

function StatCard({ label, value, hint }: { label: string; value: number | string; hint: string }) {
  return (
    <Card className="shadow-none">
      <CardContent className="p-4">
        <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
        <div className="mt-1 font-serif text-3xl font-semibold">{value}</div>
        <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>
      </CardContent>
    </Card>
  );
}

function InquiryCard({
  inq, campusName, onSelect, onMove, onConvert,
}: {
  inq: Inquiry;
  campusName: string | null | undefined;
  onSelect: () => void;
  onMove: (s: Status) => void;
  onConvert: () => void;
}) {
  const nextStatus: Record<Status, Status | null> = {
    new: "contacted",
    contacted: "visited",
    visited: "converted",
    converted: null,
    lost: null,
  };
  const next = nextStatus[inq.status];
  return (
    <div className="rounded-md border border-border bg-card p-3 hover:border-primary/40 transition-colors">
      <button onClick={onSelect} className="block w-full text-left">
        <div className="font-medium text-sm">{inq.student_name}</div>
        <div className="mt-0.5 text-xs text-muted-foreground truncate">
          {inq.grade_applying_for ?? "Grade —"} · {campusName ?? "No campus"}
        </div>
        <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
          <Phone className="h-3 w-3" /> {inq.guardian_phone}
        </div>
        <div className="mt-1 flex items-center gap-1 text-[10px] text-muted-foreground">
          <Clock className="h-3 w-3" /> {formatDistanceToNow(new Date(inq.created_at), { addSuffix: true })}
        </div>
      </button>
      <div className="mt-3 flex gap-1.5">
        {inq.status === "visited" || inq.status === "contacted" ? (
          <Button size="sm" className="h-7 flex-1 text-xs" onClick={onConvert}>
            Convert
          </Button>
        ) : next ? (
          <Button size="sm" variant="outline" className="h-7 flex-1 text-xs" onClick={() => onMove(next)}>
            <ArrowRight className="mr-1 h-3 w-3" /> {next}
          </Button>
        ) : null}
        {inq.status !== "lost" && inq.status !== "converted" && (
          <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground" onClick={() => onMove("lost")}>
            Lost
          </Button>
        )}
      </div>
    </div>
  );
}

function InquiryDetailDialog({
  inquiry, open, campusName, onClose, onMove, onConvert,
}: {
  inquiry: Inquiry | null;
  open: boolean;
  campusName: string | null;
  onClose: () => void;
  onMove: (s: Status) => void;
  onConvert: () => void;
}) {
  if (!inquiry) return null;
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-serif text-2xl">{inquiry.student_name}</DialogTitle>
          <div className="flex items-center gap-2 pt-1">
            <Badge variant="outline" className={STATUS_STYLES[inquiry.status]}>{inquiry.status}</Badge>
            {inquiry.source && <span className="text-xs text-muted-foreground">via {inquiry.source}</span>}
            <span className="text-xs text-muted-foreground">
              · {formatDistanceToNow(new Date(inquiry.created_at), { addSuffix: true })}
            </span>
          </div>
        </DialogHeader>

        <div className="grid gap-6 md:grid-cols-2 py-2 text-sm">
          <DetailBlock title="Student">
            <Row k="Grade">{inquiry.grade_applying_for ?? "—"}</Row>
            <Row k="Date of birth">{inquiry.student_dob ?? "—"}</Row>
            <Row k="Gender">{inquiry.student_gender ?? "—"}</Row>
            <Row k="Previous school">{inquiry.previous_school ?? "—"}</Row>
          </DetailBlock>
          <DetailBlock title="Guardian">
            <Row k="Name">{inquiry.guardian_name}{inquiry.guardian_relation ? ` (${inquiry.guardian_relation})` : ""}</Row>
            <Row k="Phone"><a className="hover:underline" href={`tel:${inquiry.guardian_phone}`}><Phone className="mr-1 inline h-3 w-3" />{inquiry.guardian_phone}</a></Row>
            {inquiry.guardian_email && <Row k="Email"><a className="hover:underline" href={`mailto:${inquiry.guardian_email}`}><Mail className="mr-1 inline h-3 w-3" />{inquiry.guardian_email}</a></Row>}
            {inquiry.address && <Row k="Address"><MapPin className="mr-1 inline h-3 w-3" />{inquiry.address}</Row>}
          </DetailBlock>
          <DetailBlock title="Preferences" className="md:col-span-2">
            <Row k="Campus">{campusName ?? "—"}</Row>
            <Row k="Academic system">{inquiry.academic_system ?? "—"}</Row>
            {inquiry.notes && <Row k="Notes"><span className="whitespace-pre-wrap">{inquiry.notes}</span></Row>}
          </DetailBlock>
        </div>

        <DialogFooter className="flex-wrap gap-2">
          <div className="mr-auto flex items-center gap-2">
            <Label className="text-xs text-muted-foreground">Move to</Label>
            <Select value={inquiry.status} onValueChange={(s) => onMove(s as Status)}>
              <SelectTrigger className="w-[160px] h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                {COLUMNS.map((c) => <SelectItem key={c.status} value={c.status}>{c.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {inquiry.status !== "converted" && (
            <Button onClick={onConvert}><UserPlus className="mr-1 h-4 w-4" /> Convert to student</Button>
          )}
          {inquiry.status === "converted" && inquiry.converted_student_id && (
            <Button variant="outline" asChild>
              <a href={`/students`}><ExternalLink className="mr-1 h-4 w-4" /> View in Students</a>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DetailBlock({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">{title}</div>
      <dl className="space-y-1.5">{children}</dl>
    </div>
  );
}

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-28 shrink-0 text-xs text-muted-foreground">{k}</dt>
      <dd className="flex-1">{children}</dd>
    </div>
  );
}

// ─── New inquiry (staff walk-in) ──────────────────────────────────────────
function NewInquiryDialog({
  open, onClose, campuses, defaultCampusId, onDone,
}: {
  open: boolean;
  onClose: () => void;
  campuses: { id: string; name: string; academic_system: AcademicSystem }[];
  defaultCampusId: string | null;
  onDone: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [campusId, setCampusId] = useState<string>(defaultCampusId ?? "");
  const selectedCampus = campuses.find((c) => c.id === campusId);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const student_name = String(fd.get("student_name") ?? "").trim();
    const guardian_name = String(fd.get("guardian_name") ?? "").trim();
    const guardian_phone = String(fd.get("guardian_phone") ?? "").trim();
    if (!student_name || !guardian_name || !guardian_phone) {
      toast.error("Student, guardian, and phone are required");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("inquiries").insert({
      student_name,
      guardian_name,
      guardian_phone,
      guardian_email: (fd.get("guardian_email") as string) || null,
      grade_applying_for: (fd.get("grade_applying_for") as string) || null,
      campus_id: campusId || null,
      academic_system: (fd.get("academic_system") as AcademicSystem) || (selectedCampus?.academic_system === "both" ? null : selectedCampus?.academic_system ?? null),
      notes: (fd.get("notes") as string) || null,
      source: "walk-in",
      status: "new",
    });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Inquiry logged");
    onDone();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle className="font-serif">Log a walk-in inquiry</DialogTitle></DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2 col-span-2">
              <Label>Student name</Label>
              <Input name="student_name" required />
            </div>
            <div className="space-y-2">
              <Label>Grade</Label>
              <Input name="grade_applying_for" placeholder="e.g. Class 9" />
            </div>
            <div className="space-y-2">
              <Label>Campus</Label>
              <Select value={campusId} onValueChange={setCampusId}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {campuses.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {selectedCampus?.academic_system === "both" && (
              <div className="space-y-2 col-span-2">
                <Label>Academic system</Label>
                <Select name="academic_system">
                  <SelectTrigger><SelectValue placeholder="Board or Cambridge" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="board">Board</SelectItem>
                    <SelectItem value="cambridge">Cambridge</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2 col-span-2">
              <Label>Guardian name</Label>
              <Input name="guardian_name" required />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input name="guardian_phone" required />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input name="guardian_email" type="email" />
            </div>
            <div className="space-y-2 col-span-2">
              <Label>Notes</Label>
              <Textarea name="notes" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Log inquiry"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Convert inquiry → student ───────────────────────────────────────────
function ConvertDialog({
  inquiry, open, onClose, onDone,
}: {
  inquiry: Inquiry | null;
  open: boolean;
  onClose: () => void;
  onDone: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [campusId, setCampusId] = useState<string>("");
  const [programId, setProgramId] = useState<string>("");
  const [classId, setClassId] = useState<string>("");
  const [sectionId, setSectionId] = useState<string>("");

  const { data: campuses } = useQuery({
    queryKey: ["campuses"],
    queryFn: async () => (await supabase.from("campuses").select("id, name, academic_system").order("name")).data ?? [],
  });
  const effectiveCampusId = campusId || inquiry?.campus_id || "";
  const { data: programs } = useQuery({
    queryKey: ["programs", effectiveCampusId],
    enabled: !!effectiveCampusId,
    queryFn: async () => (await supabase.from("programs").select("id, name").eq("campus_id", effectiveCampusId).order("name")).data ?? [],
  });
  const effectiveProgramId = programId || inquiry?.program_id || "";
  const { data: classes } = useQuery({
    queryKey: ["classes", effectiveProgramId],
    enabled: !!effectiveProgramId,
    queryFn: async () => (await supabase.from("classes").select("id, name").eq("program_id", effectiveProgramId).order("name")).data ?? [],
  });
  const { data: sections } = useQuery({
    queryKey: ["sections", classId],
    enabled: !!classId,
    queryFn: async () => (await supabase.from("sections").select("id, name").eq("class_id", classId).order("name")).data ?? [],
  });
  const { data: existingCodes } = useQuery({
    queryKey: ["student-codes", effectiveCampusId],
    enabled: !!effectiveCampusId,
    queryFn: async () => (await supabase.from("students").select("student_code").eq("campus_id", effectiveCampusId)).data ?? [],
  });

  if (!inquiry) return null;

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!inquiry) return;
    const fd = new FormData(e.currentTarget);
    const finalCampusId = effectiveCampusId;
    if (!finalCampusId) { toast.error("Choose a campus"); return; }

    const [firstName, ...rest] = inquiry.student_name.trim().split(/\s+/);
    const lastName = rest.join(" ") || firstName;

    let studentCode = String(fd.get("student_code") ?? "").trim().toUpperCase();
    if (!studentCode) {
      const campusCode = campuses?.find((c) => c.id === finalCampusId)?.name ?? "STU";
      const existing = (existingCodes ?? []).map((r) => r.student_code as string);
      const year = new Date().getFullYear().toString().slice(-2);
      const base = generateCode(campusCode, []).replace(/\d+$/, "") + year;
      // find next number for this base
      let n = 1;
      const taken = new Set(existing.map((s) => s.toUpperCase()));
      while (taken.has(`${base}-${String(n).padStart(4, "0")}`)) n++;
      studentCode = `${base}-${String(n).padStart(4, "0")}`;
    }

    const acadSystem = (fd.get("academic_system") as AcademicSystem) || inquiry.academic_system || "board";
    const grade = String(fd.get("grade") ?? "").trim() || inquiry.grade_applying_for || null;

    setSaving(true);
    const { data: student, error: studentErr } = await supabase
      .from("students")
      .insert({
        campus_id: finalCampusId,
        student_code: studentCode,
        first_name: firstName,
        last_name: lastName,
        date_of_birth: inquiry.student_dob,
        gender: inquiry.student_gender,
        guardian_name: inquiry.guardian_name,
        guardian_phone: inquiry.guardian_phone,
        address: inquiry.address,
        program_id: effectiveProgramId || null,
        class_id: classId || null,
        section_id: sectionId || null,
        grade,
        academic_system: acadSystem === "both" ? "board" : acadSystem,
        status: "active",
      })
      .select("id")
      .single();

    if (studentErr || !student) {
      setSaving(false);
      return toast.error(studentErr?.message ?? "Failed to create student");
    }

    const { error: updateErr } = await supabase
      .from("inquiries")
      .update({
        status: "converted",
        converted_student_id: student.id,
        converted_at: new Date().toISOString(),
      })
      .eq("id", inquiry.id);
    setSaving(false);

    if (updateErr) return toast.error(updateErr.message);
    toast.success(`${inquiry.student_name} enrolled as ${studentCode}`);
    onDone();
  }

  const campusIsBoth = campuses?.find((c) => c.id === effectiveCampusId)?.academic_system === "both";

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="font-serif">Convert to student</DialogTitle>
          <p className="text-sm text-muted-foreground pt-1">
            Enroll {inquiry.student_name} into a campus, program, and section. A student ID is generated automatically.
          </p>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Student ID</Label>
              <Input name="student_code" placeholder="Auto-generated" />
            </div>
            <div className="space-y-2">
              <Label>Grade</Label>
              <Input
                name="grade"
                defaultValue={inquiry.grade_applying_for ?? ""}
                placeholder={inquiry.grade_applying_for ? undefined : "e.g. Class 9"}
              />
            </div>
            <div className="space-y-2 col-span-2">
              <Label>Campus</Label>
              <Select value={effectiveCampusId} onValueChange={(v) => { setCampusId(v); setProgramId(""); setClassId(""); setSectionId(""); }}>
                <SelectTrigger><SelectValue placeholder="Select campus" /></SelectTrigger>
                <SelectContent>
                  {campuses?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {campusIsBoth && (
              <div className="space-y-2 col-span-2">
                <Label>Academic system</Label>
                <Select name="academic_system" defaultValue={inquiry.academic_system ?? "board"}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="board">Board</SelectItem>
                    <SelectItem value="cambridge">Cambridge</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Program</Label>
              <Select value={effectiveProgramId} onValueChange={(v) => { setProgramId(v); setClassId(""); setSectionId(""); }} disabled={!effectiveCampusId}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {programs?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Class</Label>
              <Select value={classId} onValueChange={(v) => { setClassId(v); setSectionId(""); }} disabled={!effectiveProgramId}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {classes?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 col-span-2">
              <Label>Section</Label>
              <Select value={sectionId} onValueChange={setSectionId} disabled={!classId}>
                <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  {sections?.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving ? "Enrolling…" : "Enroll student"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function GatedAdmissionsPage() {
  return (
    <FeatureGate feature="admissions" title="Admissions">
      <AdmissionsPage />
    </FeatureGate>
  );
}
