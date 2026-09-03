import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Download, Upload, FileSpreadsheet, Loader2, CircleAlert, CircleCheck } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useTenant } from "@/lib/tenant-context";
import { parseCsvObjects, toCsv, downloadCsv } from "@/lib/csv";
import { generateCode } from "@/lib/generate-code";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/import-export")({
  head: () => ({
    meta: [
      { title: "Import & Export — EduCore" },
      { name: "description", content: "Bulk import students, staff and marks from CSV, and export data." },
      { property: "og:title", content: "Import & Export — EduCore" },
      { property: "og:description", content: "Bulk import students, staff and marks from CSV, and export data." },
    ],
  }),
  component: ImportExportPage,
});

type RowResult = { row: number; label: string; ok: boolean; message: string };

const STUDENT_HEADERS = [
  "first_name", "last_name", "gender", "date_of_birth", "guardian_name",
  "guardian_phone", "guardian_occupation", "address", "class", "section", "admission_date",
];
const STAFF_HEADERS = [
  "first_name", "last_name", "designation", "department", "email",
  "phone", "qualification", "date_of_joining", "address",
];

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function ImportExportPage() {
  const qc = useQueryClient();
  const { data: user } = useCurrentUser();
  const { tenant } = useTenant();
  const isAdmin = user?.roles.some((r) => r === "super_admin" || r === "campus_admin") ?? false;

  const [campusId, setCampusId] = useState("");
  const { data: campuses } = useQuery({
    queryKey: ["campuses"],
    queryFn: async () => (await supabase.from("campuses").select("id, name").order("name")).data ?? [],
  });
  const ownCampus = (campuses ?? []).some((c) => c.id === user?.campusId) ? user?.campusId : null;
  const activeCampus = campusId || ownCampus || campuses?.[0]?.id || "";

  const { data: classes } = useQuery({
    queryKey: ["ie.classes", activeCampus],
    enabled: !!activeCampus,
    queryFn: async () =>
      (await supabase.from("classes").select("id, name").eq("campus_id", activeCampus).order("name")).data ?? [],
  });
  const { data: sections } = useQuery({
    queryKey: ["ie.sections", activeCampus],
    enabled: !!activeCampus,
    queryFn: async () =>
      (await supabase.from("sections").select("id, name, class_id").eq("campus_id", activeCampus).order("name")).data ?? [],
  });

  if (!isAdmin) {
    return (
      <Card className="mx-auto mt-10 max-w-lg shadow-none">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Only administrators can import or export data.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Import & Export"
        description="Bulk-import students, staff and marks from CSV files, or export your data."
      />

      <div className="flex flex-wrap items-center gap-3">
        <Label className="text-xs uppercase tracking-wide text-muted-foreground">Campus</Label>
        <Select value={activeCampus} onValueChange={setCampusId}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Select campus" /></SelectTrigger>
          <SelectContent>
            {(campuses ?? []).map((c) => (
              <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="students">
        <TabsList className="flex-wrap">
          <TabsTrigger value="students">Import Students</TabsTrigger>
          <TabsTrigger value="staff">Import Staff</TabsTrigger>
          <TabsTrigger value="marks">Import Marks</TabsTrigger>
          <TabsTrigger value="export">Export</TabsTrigger>
        </TabsList>

        <TabsContent value="students">
          <StudentImport
            campusId={activeCampus}
            tenantId={tenant?.id ?? ""}
            academicSystem={tenant?.academic_system ?? "both"}
            classes={classes ?? []}
            sections={sections ?? []}
            onDone={() => qc.invalidateQueries({ queryKey: ["students"] })}
          />
        </TabsContent>
        <TabsContent value="staff">
          <StaffImport
            campusId={activeCampus}
            tenantId={tenant?.id ?? ""}
            academicSystem={tenant?.academic_system ?? "both"}
            onDone={() => qc.invalidateQueries({ queryKey: ["staff"] })}
          />
        </TabsContent>
        <TabsContent value="marks">
          <MarksImport campusId={activeCampus} tenantId={tenant?.id ?? ""} />
        </TabsContent>
        <TabsContent value="export">
          <ExportPanel campusId={activeCampus} campusName={(campuses ?? []).find((c) => c.id === activeCampus)?.name ?? "campus"} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Shared pieces                                                       */
/* ------------------------------------------------------------------ */

function FilePicker({ onParsed, disabled }: { onParsed: (rows: Record<string, string>[]) => void; disabled?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div>
      <input
        ref={ref}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          const text = await file.text();
          const rows = parseCsvObjects(text);
          if (rows.length === 0) {
            toast.error("No data rows found in that file.");
            return;
          }
          onParsed(rows);
        }}
      />
      <Button variant="outline" size="sm" disabled={disabled} onClick={() => ref.current?.click()}>
        <Upload className="mr-2 h-4 w-4" /> Upload filled CSV
      </Button>
    </div>
  );
}

function ResultsList({ results }: { results: RowResult[] }) {
  const failed = results.filter((r) => !r.ok);
  if (results.length === 0) return null;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-4 text-sm">
        <span className="flex items-center gap-1 text-green-700">
          <CircleCheck className="h-4 w-4" /> {results.length - failed.length} imported
        </span>
        {failed.length > 0 && (
          <>
            <span className="flex items-center gap-1 text-destructive">
              <CircleAlert className="h-4 w-4" /> {failed.length} failed
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                downloadCsv("import-errors.csv", toCsv(["row", "record", "reason"], failed.map((f) => [f.row, f.label, f.message])))
              }
            >
              Download error list
            </Button>
          </>
        )}
      </div>
      {failed.length > 0 && (
        <div className="max-h-48 overflow-y-auto rounded-sm border text-xs">
          {failed.map((f) => (
            <div key={f.row} className="flex gap-3 border-b px-3 py-1.5 last:border-0">
              <span className="w-12 shrink-0 text-muted-foreground">Row {f.row}</span>
              <span className="w-40 shrink-0 truncate font-medium">{f.label}</span>
              <span className="text-destructive">{f.message}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ImportCard({
  title,
  headers,
  templateName,
  onFile,
  busy,
  results,
  children,
}: {
  title: string;
  headers: string[];
  templateName: string;
  onFile: (rows: Record<string, string>[]) => void;
  busy: boolean;
  results: RowResult[];
  children?: React.ReactNode;
}) {
  return (
    <Card className="shadow-none">
      <CardContent className="space-y-4 py-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-serif text-base font-semibold">{title}</h3>
            <p className="text-xs text-muted-foreground">
              Columns: {headers.join(", ")}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => downloadCsv(templateName, toCsv(headers, []))}
            >
              <FileSpreadsheet className="mr-2 h-4 w-4" /> Download template
            </Button>
            <FilePicker disabled={busy} onParsed={onFile} />
            {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          </div>
        </div>
        {children}
        <ResultsList results={results} />
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Students import                                                     */
/* ------------------------------------------------------------------ */

function StudentImport({
  campusId,
  tenantId,
  academicSystem,
  classes,
  sections,
  onDone,
}: {
  campusId: string;
  tenantId: string;
  academicSystem: "board" | "cambridge" | "both";
  classes: { id: string; name: string }[];
  sections: { id: string; name: string; class_id: string }[];
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<RowResult[]>([]);

  async function run(rows: Record<string, string>[]) {
    if (!campusId || !tenantId) return;
    setBusy(true);
    const out: RowResult[] = [];
    try {
      const { data: existing } = await supabase.from("students").select("student_code").eq("campus_id", campusId);
      const taken = (existing ?? []).map((s) => s.student_code);

      const classByName = new Map(classes.map((c) => [c.name.trim().toLowerCase(), c.id]));
      const secByKey = new Map(sections.map((s) => [`${s.class_id}:${s.name.trim().toLowerCase()}`, s.id]));

      const inserts: Record<string, unknown>[] = [];
      const rowMeta: { row: number; label: string }[] = [];

      rows.forEach((r, i) => {
        const rowNum = i + 2; // header is row 1
        const label = `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() || `Row ${rowNum}`;
        const fail = (message: string) => out.push({ row: rowNum, label, ok: false, message });

        if (!r.first_name) return fail("first_name is required");
        if (r.date_of_birth && !DATE_RE.test(r.date_of_birth)) return fail("date_of_birth must be YYYY-MM-DD");
        if (r.admission_date && !DATE_RE.test(r.admission_date)) return fail("admission_date must be YYYY-MM-DD");

        const classId = r.class ? classByName.get(r.class.toLowerCase()) : undefined;
        if (r.class && !classId) return fail(`Class "${r.class}" not found on this campus`);
        const sectionId = r.section && classId ? secByKey.get(`${classId}:${r.section.toLowerCase()}`) : undefined;
        if (r.section && !sectionId) return fail(`Section "${r.section}" not found in class "${r.class}"`);

        const code = generateCode(`${r.first_name} ${r.last_name ?? ""}`, taken);
        taken.push(code);
        inserts.push({
          tenant_id: tenantId,
          campus_id: campusId,
          student_code: code,
          first_name: r.first_name,
          last_name: r.last_name || "",
          gender: r.gender || null,
          date_of_birth: r.date_of_birth || null,
          guardian_name: r.guardian_name || null,
          guardian_phone: r.guardian_phone || null,
          guardian_occupation: r.guardian_occupation || null,
          address: r.address || null,
          class_id: classId ?? null,
          section_id: sectionId ?? null,
          admission_date: r.admission_date || null,
          academic_system: academicSystem,
          status: "active",
        });
        rowMeta.push({ row: rowNum, label });
      });

      // Insert in batches; a failed batch is retried row-by-row to isolate errors.
      for (let i = 0; i < inserts.length; i += 100) {
        const batch = inserts.slice(i, i + 100);
        const meta = rowMeta.slice(i, i + 100);
        const { error } = await supabase.from("students").insert(batch);
        if (!error) {
          meta.forEach((m) => out.push({ ...m, ok: true, message: "" }));
        } else {
          for (let j = 0; j < batch.length; j++) {
            const { error: rowErr } = await supabase.from("students").insert(batch[j]);
            out.push(rowErr
              ? { ...meta[j], ok: false, message: rowErr.message }
              : { ...meta[j], ok: true, message: "" });
          }
        }
      }
      out.sort((a, b) => a.row - b.row);
      setResults(out);
      const okCount = out.filter((r) => r.ok).length;
      toast.success(`Imported ${okCount} of ${rows.length} students.`);
      if (okCount > 0) onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ImportCard
      title="Import students"
      headers={STUDENT_HEADERS}
      templateName="students-template.csv"
      onFile={run}
      busy={busy}
      results={results}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Staff import                                                        */
/* ------------------------------------------------------------------ */

function StaffImport({
  campusId,
  tenantId,
  academicSystem,
  onDone,
}: {
  campusId: string;
  tenantId: string;
  academicSystem: "board" | "cambridge" | "both";
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<RowResult[]>([]);

  async function run(rows: Record<string, string>[]) {
    if (!campusId || !tenantId) return;
    setBusy(true);
    const out: RowResult[] = [];
    try {
      const { data: existing } = await supabase.from("staff").select("staff_code").eq("campus_id", campusId);
      const taken = (existing ?? []).map((s) => s.staff_code);

      const inserts: Record<string, unknown>[] = [];
      const rowMeta: { row: number; label: string }[] = [];

      rows.forEach((r, i) => {
        const rowNum = i + 2;
        const label = `${r.first_name ?? ""} ${r.last_name ?? ""}`.trim() || `Row ${rowNum}`;
        const fail = (message: string) => out.push({ row: rowNum, label, ok: false, message });

        if (!r.first_name) return fail("first_name is required");
        if (r.date_of_joining && !DATE_RE.test(r.date_of_joining)) return fail("date_of_joining must be YYYY-MM-DD");

        const code = generateCode(`${r.first_name} ${r.last_name ?? ""}`, taken);
        taken.push(code);
        inserts.push({
          tenant_id: tenantId,
          campus_id: campusId,
          staff_code: code,
          first_name: r.first_name,
          last_name: r.last_name || "",
          designation: r.designation || null,
          department: r.department || null,
          email: r.email || null,
          phone: r.phone || null,
          qualification: r.qualification || null,
          date_of_joining: r.date_of_joining || null,
          address: r.address || null,
          academic_system: academicSystem,
          status: "active",
        });
        rowMeta.push({ row: rowNum, label });
      });

      for (let i = 0; i < inserts.length; i += 100) {
        const batch = inserts.slice(i, i + 100);
        const meta = rowMeta.slice(i, i + 100);
        const { error } = await supabase.from("staff").insert(batch);
        if (!error) {
          meta.forEach((m) => out.push({ ...m, ok: true, message: "" }));
        } else {
          for (let j = 0; j < batch.length; j++) {
            const { error: rowErr } = await supabase.from("staff").insert(batch[j]);
            out.push(rowErr
              ? { ...meta[j], ok: false, message: rowErr.message }
              : { ...meta[j], ok: true, message: "" });
          }
        }
      }
      out.sort((a, b) => a.row - b.row);
      setResults(out);
      const okCount = out.filter((r) => r.ok).length;
      toast.success(`Imported ${okCount} of ${rows.length} staff.`);
      if (okCount > 0) onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ImportCard
      title="Import staff"
      headers={STAFF_HEADERS}
      templateName="staff-template.csv"
      onFile={run}
      busy={busy}
      results={results}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Marks import                                                        */
/* ------------------------------------------------------------------ */

type AssessmentOpt = {
  id: string;
  title: string;
  max_marks: number;
  courseTitle: string;
  sectionName: string;
  section_id: string;
};

function MarksImport({ campusId, tenantId }: { campusId: string; tenantId: string }) {
  const qc = useQueryClient();
  const [assessmentId, setAssessmentId] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<RowResult[]>([]);

  const { data: assessments } = useQuery({
    queryKey: ["ie.assessments", campusId],
    enabled: !!campusId,
    queryFn: async () => {
      const { data } = await supabase
        .from("assessments")
        .select("id, title, max_marks, section_id, courses(title), sections(name)")
        .eq("campus_id", campusId)
        .order("created_at", { ascending: false })
        .limit(200);
      return ((data ?? []) as unknown as {
        id: string; title: string; max_marks: number; section_id: string;
        courses: { title: string } | null; sections: { name: string } | null;
      }[]).map((a) => ({
        id: a.id,
        title: a.title,
        max_marks: a.max_marks,
        section_id: a.section_id,
        courseTitle: a.courses?.title ?? "",
        sectionName: a.sections?.name ?? "",
      })) as AssessmentOpt[];
    },
  });

  const assessment = (assessments ?? []).find((a) => a.id === assessmentId) ?? null;

  const { data: roster } = useQuery({
    queryKey: ["ie.roster", assessment?.section_id],
    enabled: !!assessment,
    queryFn: async () =>
      (await supabase
        .from("students")
        .select("id, student_code, first_name, last_name")
        .eq("section_id", assessment!.section_id)
        .eq("status", "active")
        .order("first_name")).data ?? [],
  });

  function downloadPrefilled() {
    if (!assessment || !roster) return;
    downloadCsv(
      `marks-${assessment.title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.csv`,
      toCsv(
        ["student_code", "student_name", "marks", "remarks"],
        roster.map((s) => [s.student_code, `${s.first_name} ${s.last_name}`, "", ""]),
      ),
    );
  }

  async function run(rows: Record<string, string>[]) {
    if (!assessment || !campusId || !tenantId || !roster) return;
    setBusy(true);
    const out: RowResult[] = [];
    try {
      const byCode = new Map(roster.map((s) => [s.student_code.toLowerCase(), s]));
      const { data: existing } = await supabase
        .from("assessment_scores")
        .select("id, student_id")
        .eq("assessment_id", assessment.id);
      const existingByStudent = new Map((existing ?? []).map((e) => [e.student_id, e.id]));

      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const rowNum = i + 2;
        const label = r.student_name || r.student_code || `Row ${rowNum}`;
        const student = byCode.get((r.student_code ?? "").toLowerCase());
        if (!student) {
          out.push({ row: rowNum, label, ok: false, message: `Student code "${r.student_code}" not in this section` });
          continue;
        }
        const marksRaw = (r.marks ?? "").trim();
        const isAbsent = /^absent$/i.test(marksRaw) || /^a$/i.test(marksRaw);
        const marks = isAbsent || marksRaw === "" ? null : Number(marksRaw);
        if (!isAbsent && marksRaw !== "" && (Number.isNaN(marks) || marks < 0 || marks > assessment.max_marks)) {
          out.push({ row: rowNum, label, ok: false, message: `Marks must be 0–${assessment.max_marks} or "absent"` });
          continue;
        }
        const payload = {
          tenant_id: tenantId,
          campus_id: campusId,
          assessment_id: assessment.id,
          student_id: student.id,
          marks,
          is_absent: isAbsent,
          remarks: r.remarks || null,
        };
        const existingId = existingByStudent.get(student.id);
        const { error } = existingId
          ? await supabase.from("assessment_scores").update(payload).eq("id", existingId)
          : await supabase.from("assessment_scores").insert(payload);
        out.push(error
          ? { row: rowNum, label, ok: false, message: error.message }
          : { row: rowNum, label, ok: true, message: "" });
      }
      setResults(out);
      const okCount = out.filter((r) => r.ok).length;
      toast.success(`Saved marks for ${okCount} of ${rows.length} rows.`);
      if (okCount > 0) qc.invalidateQueries({ queryKey: ["academics"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="shadow-none">
      <CardContent className="space-y-4 py-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs uppercase tracking-wide text-muted-foreground">Assessment</Label>
            <Select value={assessmentId} onValueChange={setAssessmentId}>
              <SelectTrigger className="w-80"><SelectValue placeholder="Choose an assessment" /></SelectTrigger>
              <SelectContent>
                {(assessments ?? []).map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.title} — {a.courseTitle} ({a.sectionName})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="ghost" size="sm" disabled={!assessment} onClick={downloadPrefilled}>
            <FileSpreadsheet className="mr-2 h-4 w-4" /> Template with enrolled students
          </Button>
          <FilePicker disabled={!assessment || busy} onParsed={run} />
          {busy && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        {assessment && (
          <p className="text-xs text-muted-foreground">
            Max marks: {assessment.max_marks}. Enter a number, or "absent". Rows are matched by student_code;
            existing marks for this assessment are overwritten.
          </p>
        )}
        <ResultsList results={results} />
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/* Export                                                              */
/* ------------------------------------------------------------------ */

type ExportDef = {
  key: string;
  label: string;
  description: string;
  run: (campusId: string) => Promise<{ headers: string[]; rows: unknown[][] }>;
};

const EXPORTS: ExportDef[] = [
  {
    key: "students",
    label: "Students",
    description: "All students with class, section and guardian details.",
    run: async (campusId) => {
      const { data, error } = await supabase
        .from("students")
        .select("student_code, first_name, last_name, gender, date_of_birth, guardian_name, guardian_phone, guardian_occupation, address, admission_date, status, classes(name), sections(name)")
        .eq("campus_id", campusId)
        .order("first_name");
      if (error) throw error;
      const rows = (data ?? []) as unknown as Record<string, unknown>[];
      return {
        headers: ["student_code", "first_name", "last_name", "gender", "date_of_birth", "guardian_name", "guardian_phone", "guardian_occupation", "class", "section", "admission_date", "status"],
        rows: rows.map((s) => [
          s.student_code, s.first_name, s.last_name, s.gender, s.date_of_birth,
          s.guardian_name, s.guardian_phone, s.guardian_occupation,
          (s.classes as { name: string } | null)?.name, (s.sections as { name: string } | null)?.name,
          s.admission_date, s.status,
        ]),
      };
    },
  },
  {
    key: "staff",
    label: "Staff",
    description: "All staff with designation, department and contact details.",
    run: async (campusId) => {
      const { data, error } = await supabase
        .from("staff")
        .select("staff_code, first_name, last_name, designation, department, email, phone, qualification, date_of_joining, status")
        .eq("campus_id", campusId)
        .order("first_name");
      if (error) throw error;
      return {
        headers: ["staff_code", "first_name", "last_name", "designation", "department", "email", "phone", "qualification", "date_of_joining", "status"],
        rows: (data ?? []).map((s) => [s.staff_code, s.first_name, s.last_name, s.designation, s.department, s.email, s.phone, s.qualification, s.date_of_joining, s.status]),
      };
    },
  },
  {
    key: "attendance",
    label: "Attendance",
    description: "Attendance records with student names and status.",
    run: async (campusId) => {
      const { data, error } = await supabase
        .from("attendance_records")
        .select("date, status, remarks, students(student_code, first_name, last_name), sections(name)")
        .eq("campus_id", campusId)
        .order("date", { ascending: false })
        .limit(10000);
      if (error) throw error;
      const rows = (data ?? []) as unknown as Record<string, unknown>[];
      return {
        headers: ["date", "student_code", "student_name", "section", "status", "remarks"],
        rows: rows.map((r) => {
          const st = r.students as { student_code: string; first_name: string; last_name: string } | null;
          return [
            r.date, st?.student_code, st ? `${st.first_name} ${st.last_name}` : "",
            (r.sections as { name: string } | null)?.name, r.status, r.remarks,
          ];
        }),
      };
    },
  },
  {
    key: "challans",
    label: "Fee Challans",
    description: "Challans with amounts, discounts and payment status.",
    run: async (campusId) => {
      const { data, error } = await supabase
        .from("fee_challans")
        .select("challan_no, category, period_label, issue_date, due_date, gross_amount, discount_amount, fine_amount, paid_amount, status, paid_on, students(student_code, first_name, last_name)")
        .eq("campus_id", campusId)
        .order("issue_date", { ascending: false })
        .limit(10000);
      if (error) throw error;
      const rows = (data ?? []) as unknown as Record<string, unknown>[];
      return {
        headers: ["challan_no", "student_code", "student_name", "category", "period", "issue_date", "due_date", "gross", "discount", "fine", "paid", "status", "paid_on"],
        rows: rows.map((c) => {
          const st = c.students as { student_code: string; first_name: string; last_name: string } | null;
          return [
            c.challan_no, st?.student_code, st ? `${st.first_name} ${st.last_name}` : "",
            c.category, c.period_label, c.issue_date, c.due_date,
            c.gross_amount, c.discount_amount, c.fine_amount, c.paid_amount, c.status, c.paid_on,
          ];
        }),
      };
    },
  },
  {
    key: "marks",
    label: "Results / Marks",
    description: "Assessment scores per student, course and assessment.",
    run: async (campusId) => {
      const { data, error } = await supabase
        .from("assessment_scores")
        .select("marks, is_absent, remarks, students(student_code, first_name, last_name), assessments(title, max_marks, type, courses(title))")
        .eq("campus_id", campusId)
        .limit(10000);
      if (error) throw error;
      const rows = (data ?? []) as unknown as Record<string, unknown>[];
      return {
        headers: ["student_code", "student_name", "course", "assessment", "type", "marks", "max_marks", "is_absent", "remarks"],
        rows: rows.map((r) => {
          const st = r.students as { student_code: string; first_name: string; last_name: string } | null;
          const a = r.assessments as { title: string; max_marks: number; type: string; courses: { title: string } | null } | null;
          return [
            st?.student_code, st ? `${st.first_name} ${st.last_name}` : "",
            a?.courses?.title, a?.title, a?.type, r.marks, a?.max_marks, r.is_absent ? "yes" : "", r.remarks,
          ];
        }),
      };
    },
  },
  {
    key: "inquiries",
    label: "Admissions Inquiries",
    description: "All admission inquiries with status and guardian contact.",
    run: async (campusId) => {
      const { data, error } = await supabase
        .from("inquiries")
        .select("student_name, grade_applying_for, guardian_name, guardian_phone, guardian_email, source, status, created_at")
        .eq("campus_id", campusId)
        .order("created_at", { ascending: false })
        .limit(10000);
      if (error) throw error;
      return {
        headers: ["student_name", "grade_applying_for", "guardian_name", "guardian_phone", "guardian_email", "source", "status", "created_at"],
        rows: (data ?? []).map((q) => [
          q.student_name, q.grade_applying_for, q.guardian_name, q.guardian_phone,
          q.guardian_email, q.source, q.status, q.created_at?.slice(0, 10),
        ]),
      };
    },
  },
];

function ExportPanel({ campusId, campusName }: { campusId: string; campusName: string }) {
  const [running, setRunning] = useState<string | null>(null);

  async function runExport(def: ExportDef) {
    if (!campusId) return;
    setRunning(def.key);
    try {
      const { headers, rows } = await def.run(campusId);
      downloadCsv(
        `${def.key}-${campusName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`,
        toCsv(headers, rows),
      );
      toast.success(`Exported ${rows.length} ${def.label.toLowerCase()} rows.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setRunning(null);
    }
  }

  return (
    <div className={cn("grid gap-3 sm:grid-cols-2 lg:grid-cols-3")}>
      {EXPORTS.map((def) => (
        <Card key={def.key} className="shadow-none">
          <CardContent className="flex flex-col gap-2 py-4">
            <h3 className="font-serif text-sm font-semibold">{def.label}</h3>
            <p className="flex-1 text-xs text-muted-foreground">{def.description}</p>
            <Button
              variant="outline"
              size="sm"
              disabled={!campusId || running !== null}
              onClick={() => runExport(def)}
            >
              {running === def.key ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              Export CSV
            </Button>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
