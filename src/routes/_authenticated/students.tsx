import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo, Fragment } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetch-all";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Upload, FileText, Pencil, Search } from "lucide-react";
import { SystemBadge } from "./campuses";
import { LayoutMenu } from "@/components/layout/layout-menu";
import { useModuleLayout } from "@/lib/ui-prefs";
import { useArranged, byText, densityCell } from "@/lib/ui-arrange";
import { useEntitlements, limitMessage } from "@/lib/entitlements";
import { useLimitStatus, LimitNotice } from "@/lib/plan-usage";
import { useSectionCapacity, SECTION_FULL_HINT } from "@/lib/section-capacity";
import { MODULE_LAYOUTS } from "@/lib/ui-layout";


export const Route = createFileRoute("/_authenticated/students")({
  component: StudentsPage,
});

type Student = {
  id: string;
  student_code: string;
  first_name: string;
  last_name: string;
  campus_id: string;
  class_id: string | null;
  section_id: string | null;
  program_id: string | null;
  guardian_name: string | null;
  guardian_phone: string | null;
  guardian_occupation: string | null;
  status: string;
  academic_system: "board" | "cambridge" | "both";
  grade: string | null;
  date_of_birth: string | null;
  gender: string | null;
  address: string | null;
  documents: Array<{ name: string; path: string }> | null;
  profile_id: string | null;
};

function StudentsPage() {
  const qc = useQueryClient();
  const ent = useEntitlements();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Student | null>(null);
  const [viewing, setViewing] = useState<Student | null>(null);
  const [uploadFor, setUploadFor] = useState<Student | null>(null);
  const [search, setSearch] = useState("");

  const { data: campuses } = useQuery({
    queryKey: ["campuses"],
    queryFn: async () => (await supabase.from("campuses").select("id, name").order("name")).data ?? [],
  });
  const { data: programs } = useQuery({
    queryKey: ["programs"],
    queryFn: async () => (await supabase.from("programs").select("id, name, campus_id")).data ?? [],
  });
  const { data: classes } = useQuery({
    queryKey: ["classes"],
    queryFn: async () => (await supabase.from("classes").select("id, name, campus_id")).data ?? [],
  });
  const { data: sections } = useQuery({
    queryKey: ["sections"],
    queryFn: async () => (await supabase.from("sections").select("id, name, class_id")).data ?? [],
  });
  const { data: students, isLoading } = useQuery({
    queryKey: ["students"],
    queryFn: async () =>
      (await fetchAllRows<Student>((from, to) =>
        supabase.from("students").select("*").order("created_at", { ascending: false }).range(from, to) as any,
      )) as Student[],
  });
  const studentLimit = useLimitStatus("students");
  const sectionCapacity = useSectionCapacity();

  const campusMap = new Map(campuses?.map((c) => [c.id, c.name]));
  const classMap = new Map(classes?.map((c) => [c.id, c.name]));
  const sectionMap = new Map(sections?.map((s) => [s.id, s.name]));
  const programMap = new Map(programs?.map((p) => [p.id, p.name]));

  const filtered = useMemo(() => {
    if (!students) return [];
    const q = search.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) => {
      const name = `${s.first_name} ${s.last_name}`.toLowerCase();
      return (
        name.includes(q)
        || (s.student_code ?? "").toLowerCase().includes(q)
        || (s.guardian_name ?? "").toLowerCase().includes(q)
        || (s.guardian_occupation ?? "").toLowerCase().includes(q)
      );
    });
  }, [students, search]);

  const { layout } = useModuleLayout("students");
  const groups = useArranged<Student>(filtered, layout, {
    group: {
      track: (s) => (s.academic_system === "cambridge" ? "Cambridge" : s.academic_system === "both" ? "Board & Cambridge" : "Board"),
      campus: (s) => campusMap.get(s.campus_id) ?? "—",
      class: (s) => classMap.get(s.class_id ?? "") ?? "No class",
      status: (s) => s.status.charAt(0).toUpperCase() + s.status.slice(1),
    },
    filter: {
      board: (s) => s.academic_system !== "cambridge",
      cambridge: (s) => s.academic_system !== "board",
      active: (s) => s.status === "active",
      inactive: (s) => s.status !== "active",
    },
    sort: {
      name: byText((s) => `${s.first_name} ${s.last_name}`),
      code: byText((s) => s.student_code),
      class: byText((s) => classMap.get(s.class_id ?? "") ?? ""),
    },
  });
  const showCol = (c: string) => !layout.hidden.includes(c);
  const cellCls = densityCell(layout.density);
  const colSpan = 3 + ["guardian", "campus", "class", "system", "docs"].filter(showCol).length;
  const shownCount = groups.reduce((n, g) => n + g.rows.length, 0);


  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (studentLimit.reached && studentLimit.cap !== null) {
      return toast.error(limitMessage("students", studentLimit.cap, ent.planName));
    }
    const fd = new FormData(e.currentTarget);
    const code = "STU-" + Date.now().toString(36).toUpperCase();
    const { error } = await supabase.from("students").insert({
      student_code: code,
      first_name: String(fd.get("first_name")),
      last_name: String(fd.get("last_name")),
      campus_id: String(fd.get("campus_id")),
      program_id: (fd.get("program_id") as string) || null,
      class_id: (fd.get("class_id") as string) || null,
      section_id: (fd.get("section_id") as string) || null,
      guardian_name: String(fd.get("guardian_name") || "") || null,
      guardian_phone: String(fd.get("guardian_phone") || "") || null,
      guardian_occupation: String(fd.get("guardian_occupation") || "") || null,
      date_of_birth: (fd.get("date_of_birth") as string) || null,
      gender: (fd.get("gender") as string) || null,
      address: String(fd.get("address") || "") || null,
      grade: String(fd.get("grade") || "") || null,
      academic_system: String(fd.get("academic_system")) as Student["academic_system"],
    });
    if (error) return toast.error(error.message);
    toast.success(`Student ${code} registered`);
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["students"] });
    qc.invalidateQueries({ queryKey: ["plan-usage"] });
  }

  async function handleUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;
    const fd = new FormData(e.currentTarget);
    const { error } = await supabase.from("students").update({
      first_name: String(fd.get("first_name")),
      last_name: String(fd.get("last_name")),
      campus_id: String(fd.get("campus_id")),
      program_id: (fd.get("program_id") as string) || null,
      class_id: (fd.get("class_id") as string) || null,
      section_id: (fd.get("section_id") as string) || null,
      guardian_name: String(fd.get("guardian_name") || "") || null,
      guardian_phone: String(fd.get("guardian_phone") || "") || null,
      guardian_occupation: String(fd.get("guardian_occupation") || "") || null,
      date_of_birth: (fd.get("date_of_birth") as string) || null,
      gender: (fd.get("gender") as string) || null,
      address: String(fd.get("address") || "") || null,
      grade: String(fd.get("grade") || "") || null,
      academic_system: String(fd.get("academic_system")) as Student["academic_system"],
    }).eq("id", editing.id);
    if (error) return toast.error(error.message);
    toast.success("Student updated");
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["students"] });
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!uploadFor || !e.target.files?.[0]) return;
    const file = e.target.files[0];
    const path = `${uploadFor.profile_id ?? uploadFor.id}/${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from("student-docs").upload(path, file);
    if (upErr) return toast.error(upErr.message);
    const newDocs = [...(uploadFor.documents ?? []), { name: file.name, path }];
    const { error } = await supabase.from("students").update({ documents: newDocs }).eq("id", uploadFor.id);
    if (error) return toast.error(error.message);
    toast.success("Document uploaded");
    setUploadFor(null);
    qc.invalidateQueries({ queryKey: ["students"] });
  }

  return (
    <>
      <PageHeader
        eyebrow="Roster"
        title="Students"
        description="Register students, assign them to classes and sections, and manage their documents."
        actions={
          <div className="flex items-center gap-2">
          {studentLimit.reached && studentLimit.cap !== null ? (
            <LimitNotice cap={studentLimit.cap} label="students" />
          ) : null}
          <LayoutMenu module="students" />
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button disabled={studentLimit.reached}><Plus className="mr-1 h-4 w-4" /> New student</Button>
            </DialogTrigger>

            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle className="font-serif">Register student</DialogTitle></DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label>First name</Label><Input name="first_name" required /></div>
                  <div className="space-y-2"><Label>Last name</Label><Input name="last_name" required /></div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-2"><Label>Date of birth</Label><Input name="date_of_birth" type="date" /></div>
                  <div className="space-y-2">
                    <Label>Gender</Label>
                    <Select name="gender">
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="male">Male</SelectItem>
                        <SelectItem value="female">Female</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Academic system</Label>
                    <Select name="academic_system" defaultValue="board">
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="board">Board</SelectItem>
                        <SelectItem value="cambridge">Cambridge</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-2"><Label>Grade</Label><Input name="grade" placeholder="e.g. Class 9" /></div>
                  <div className="space-y-2"><Label>Guardian name</Label><Input name="guardian_name" /></div>
                  <div className="space-y-2"><Label>Guardian phone</Label><Input name="guardian_phone" /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label>Guardian's occupation</Label><Input name="guardian_occupation" placeholder="e.g. Engineer" /></div>
                  <div className="space-y-2"><Label>Address</Label><Input name="address" /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Campus</Label>
                    <Select name="campus_id" required>
                      <SelectTrigger><SelectValue placeholder="Campus" /></SelectTrigger>
                      <SelectContent>{campuses?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Program</Label>
                    <Select name="program_id">
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>{programs?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Class</Label>
                    <Select name="class_id">
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>{classes?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Section</Label>
                    <Select name="section_id">
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        {sections?.map((s) => {
                          const cap = sectionCapacity.get(s.id);
                          return (
                            <SelectItem key={s.id} value={s.id} disabled={!!cap?.full}>
                              {s.name}{cap ? ` — ${sectionCapacity.label(s.id)}` : ""}
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                    <p className="text-[11px] text-muted-foreground">{SECTION_FULL_HINT}</p>
                  </div>
                </div>
                <DialogFooter><Button type="submit">Register student</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
          </div>
        }

      />

      <div className="mb-4 relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, guardian, occupation, or student ID"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <Card className="shadow-none">
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Student ID</TableHead><TableHead>Name</TableHead>
              {showCol("guardian") && <TableHead>Guardian</TableHead>}
              {showCol("campus") && <TableHead>Campus</TableHead>}
              {showCol("class") && <TableHead>Class/Section</TableHead>}
              {showCol("system") && <TableHead>System</TableHead>}
              {showCol("docs") && <TableHead>Docs</TableHead>}
              <TableHead className="text-right">Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={colSpan} className="py-8 text-center text-sm text-muted-foreground">Loading…</TableCell></TableRow>}
              {!isLoading && filtered.length === 0 && <TableRow><TableCell colSpan={colSpan} className="py-8 text-center text-sm text-muted-foreground">{search ? "No matching students." : "No students yet."}</TableCell></TableRow>}
              {groups.map((group) => (
                <Fragment key={group.key}>
                  {group.label && (
                    <TableRow className="bg-muted/50 hover:bg-muted/50">
                      <TableCell colSpan={colSpan} className="py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        {group.label} · {group.rows.length}
                      </TableCell>
                    </TableRow>
                  )}
                  {group.rows.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className={cellCls}><code className="rounded bg-muted px-1.5 py-0.5 text-xs">{s.student_code}</code></TableCell>
                  <TableCell className={cellCls}>
                    <button
                      onClick={() => setViewing(s)}
                      className="font-medium text-primary hover:underline text-left"
                    >
                      {s.first_name} {s.last_name}
                    </button>
                  </TableCell>
                  {showCol("guardian") && (
                    <TableCell className={`text-sm ${cellCls}`}>
                      <div>{s.guardian_name ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{s.guardian_occupation ?? ""}</div>
                    </TableCell>
                  )}
                  {showCol("campus") && <TableCell className={`text-sm ${cellCls}`}>{campusMap.get(s.campus_id) ?? "—"}</TableCell>}
                  {showCol("class") && <TableCell className={`text-sm ${cellCls}`}>{classMap.get(s.class_id ?? "") ?? "—"} · {sectionMap.get(s.section_id ?? "") ?? "—"}</TableCell>}
                  {showCol("system") && <TableCell className={cellCls}><SystemBadge system={s.academic_system} /></TableCell>}
                  {showCol("docs") && <TableCell className={`text-sm text-muted-foreground ${cellCls}`}><FileText className="mr-1 inline h-3 w-3" />{s.documents?.length ?? 0}</TableCell>}
                  <TableCell className={`text-right ${cellCls}`}>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(s)}><Pencil className="mr-1 h-3 w-3" /> Edit</Button>
                    <Button size="sm" variant="ghost" onClick={() => setUploadFor(s)}><Upload className="mr-1 h-3 w-3" /> Upload</Button>
                  </TableCell>
                </TableRow>
                  ))}
                </Fragment>
              ))}

            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* View student details */}
      <Dialog open={!!viewing} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-serif">
              {viewing?.first_name} {viewing?.last_name}
            </DialogTitle>
          </DialogHeader>
          {viewing && (
            <div className="grid grid-cols-2 gap-4 text-sm">
              <Detail label="Student ID" value={viewing.student_code} />
              <Detail label="Status" value={viewing.status} />
              <Detail label="Date of birth" value={viewing.date_of_birth} />
              <Detail label="Gender" value={viewing.gender} />
              <Detail label="Grade" value={viewing.grade} />
              <Detail label="Academic system" value={viewing.academic_system} />
              <Detail label="Campus" value={campusMap.get(viewing.campus_id)} />
              <Detail label="Program" value={programMap.get(viewing.program_id ?? "") ?? "—"} />
              <Detail label="Class" value={classMap.get(viewing.class_id ?? "") ?? "—"} />
              <Detail label="Section" value={sectionMap.get(viewing.section_id ?? "") ?? "—"} />
              <Detail label="Guardian" value={viewing.guardian_name} />
              <Detail label="Guardian phone" value={viewing.guardian_phone} />
              <Detail label="Guardian's occupation" value={viewing.guardian_occupation} />
              <Detail label="Documents on file" value={String(viewing.documents?.length ?? 0)} />
              <div className="col-span-2"><Detail label="Address" value={viewing.address} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { if (viewing) { const s = viewing; setViewing(null); setEditing(s); } }}>
              <Pencil className="mr-1 h-3 w-3" /> Edit
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!uploadFor} onOpenChange={(o) => !o && setUploadFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-serif">Upload document — {uploadFor?.first_name} {uploadFor?.last_name}</DialogTitle></DialogHeader>
          <Input type="file" onChange={handleUpload} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-serif">Edit student — {editing?.student_code}</DialogTitle></DialogHeader>
          {editing && (
            <form onSubmit={handleUpdate} className="space-y-4" key={editing.id}>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>First name</Label><Input name="first_name" defaultValue={editing.first_name} required /></div>
                <div className="space-y-2"><Label>Last name</Label><Input name="last_name" defaultValue={editing.last_name} required /></div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2"><Label>Date of birth</Label><Input name="date_of_birth" type="date" defaultValue={editing.date_of_birth ?? ""} /></div>
                <div className="space-y-2">
                  <Label>Gender</Label>
                  <Select name="gender" defaultValue={editing.gender ?? undefined}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Academic system</Label>
                  <Select name="academic_system" defaultValue={editing.academic_system}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="board">Board</SelectItem>
                      <SelectItem value="cambridge">Cambridge</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-2"><Label>Grade</Label><Input name="grade" defaultValue={editing.grade ?? ""} placeholder="e.g. Class 9" /></div>
                <div className="space-y-2"><Label>Guardian name</Label><Input name="guardian_name" defaultValue={editing.guardian_name ?? ""} /></div>
                <div className="space-y-2"><Label>Guardian phone</Label><Input name="guardian_phone" defaultValue={editing.guardian_phone ?? ""} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Guardian's occupation</Label><Input name="guardian_occupation" defaultValue={editing.guardian_occupation ?? ""} placeholder="e.g. Engineer" /></div>
                <div className="space-y-2"><Label>Address</Label><Input name="address" defaultValue={editing.address ?? ""} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Campus</Label>
                  <Select name="campus_id" defaultValue={editing.campus_id} required>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{campuses?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Program</Label>
                  <Select name="program_id" defaultValue={editing.program_id ?? undefined}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>{programs?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Class</Label>
                  <Select name="class_id" defaultValue={editing.class_id ?? undefined}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>{classes?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Section</Label>
                  <Select name="section_id" defaultValue={editing.section_id ?? undefined}>
                    <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                    <SelectContent>
                      {sections?.map((s) => {
                        const cap = sectionCapacity.get(s.id);
                        const blocked = !!cap?.full && s.id !== editing.section_id;
                        return (
                          <SelectItem key={s.id} value={s.id} disabled={blocked}>
                            {s.name}{cap ? ` — ${sectionCapacity.label(s.id)}` : ""}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">{SECTION_FULL_HINT}</p>
                </div>
              </div>
              <DialogFooter><Button type="submit">Save changes</Button></DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-medium">{value || "—"}</div>
    </div>
  );
}
