import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { Plus, Trash2, Printer, CalendarDays } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useTenant } from "@/lib/tenant-context";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/timetable")({
  head: () => ({
    meta: [
      { title: "Timetable & Scheduling — EduCore" },
      { name: "description", content: "Weekly class and teacher timetables with clash detection." },
      { property: "og:title", content: "Timetable & Scheduling — EduCore" },
      { property: "og:description", content: "Weekly class and teacher timetables with clash detection." },
    ],
  }),
  component: TimetablePage,
});

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

type Period = {
  id: string;
  campus_id: string;
  day_of_week: number;
  period_number: number;
  label: string | null;
  start_time: string;
  end_time: string;
  is_break: boolean;
};

type Entry = {
  id: string;
  section_id: string;
  period_id: string;
  course_id: string | null;
  teacher_id: string | null;
  room: string | null;
};

type SectionOpt = { id: string; name: string; className: string; campus_id: string };
type CourseOpt = { id: string; title: string; code: string };
type TeacherOpt = { id: string; name: string; profile_id: string | null };

const fmtTime = (t: string) => t.slice(0, 5);

function TimetablePage() {
  const qc = useQueryClient();
  const { data: user } = useCurrentUser();
  const { tenant } = useTenant();
  const canEdit = user?.roles.some((r) => r === "super_admin" || r === "campus_admin") ?? false;
  const isTeacherOnly = !canEdit && (user?.roles.includes("teacher") ?? false);

  const [campusId, setCampusId] = useState<string>("");
  const [sectionId, setSectionId] = useState<string>("");
  const [teacherId, setTeacherId] = useState<string>("");
  const [slotDialog, setSlotDialog] = useState<{ sectionId: string; period: Period } | null>(null);
  const [periodDialog, setPeriodDialog] = useState(false);
  const [printing, setPrinting] = useState<"section" | "teacher" | null>(null);

  const { data: campuses } = useQuery({
    queryKey: ["campuses"],
    queryFn: async () => (await supabase.from("campuses").select("id, name").order("name")).data ?? [],
  });
  // Default to the signed-in user's own campus so sections/teachers appear immediately.
  const ownCampus = (campuses ?? []).some((c) => c.id === user?.campusId) ? user?.campusId : null;
  const activeCampus = campusId || ownCampus || campuses?.[0]?.id || "";

  const { data: periods } = useQuery({
    queryKey: ["timetable.periods", activeCampus],
    enabled: !!activeCampus,
    queryFn: async () =>
      ((await supabase.from("timetable_periods").select("*").eq("campus_id", activeCampus)
        .order("day_of_week").order("period_number")).data ?? []) as Period[],
  });

  const { data: sections } = useQuery({
    queryKey: ["timetable.sections", activeCampus],
    enabled: !!activeCampus,
    queryFn: async () => {
      const { data } = await supabase
        .from("sections")
        .select("id, name, campus_id, classes(name)")
        .eq("campus_id", activeCampus)
        .order("name");
      return ((data ?? []) as unknown as { id: string; name: string; campus_id: string; classes: { name: string } | null }[])
        .map((s) => ({ id: s.id, name: s.name, campus_id: s.campus_id, className: s.classes?.name ?? "" }));
    },
  });

  const { data: courses } = useQuery({
    queryKey: ["timetable.courses", activeCampus],
    enabled: !!activeCampus,
    queryFn: async () =>
      ((await supabase.from("courses").select("id, title, code").eq("campus_id", activeCampus)
        .eq("is_active", true).order("title")).data ?? []) as CourseOpt[],
  });

  const { data: teachers } = useQuery({
    queryKey: ["timetable.teachers", activeCampus],
    enabled: !!activeCampus,
    queryFn: async () =>
      (((await supabase.from("staff").select("id, first_name, last_name, profile_id")
        .eq("campus_id", activeCampus).eq("status", "active").order("first_name")).data ?? []) as {
        id: string; first_name: string; last_name: string; profile_id: string | null;
      }[]).map((t) => ({ id: t.id, name: `${t.first_name} ${t.last_name}`, profile_id: t.profile_id })),
  });

  const { data: entries } = useQuery({
    queryKey: ["timetable.entries", activeCampus],
    enabled: !!activeCampus,
    queryFn: async () =>
      ((await supabase.from("timetable_entries").select("*").eq("campus_id", activeCampus))
        .data ?? []) as Entry[],
  });

  // Teachers default to their own timetable
  const myStaffId = useMemo(
    () => teachers?.find((t) => t.profile_id === user?.userId)?.id ?? "",
    [teachers, user?.userId],
  );
  const activeTeacher = isTeacherOnly ? myStaffId : teacherId || myStaffId || "";
  const activeSection = sectionId || sections?.[0]?.id || "";

  const periodList = periods ?? [];
  const periodNumbers = useMemo(
    () => [...new Set(periodList.map((p) => p.period_number))].sort((a, b) => a - b),
    [periodList],
  );
  const activeDays = useMemo(
    () => [...new Set(periodList.map((p) => p.day_of_week))].sort((a, b) => a - b),
    [periodList],
  );
  const periodAt = (day: number, num: number) =>
    periodList.find((p) => p.day_of_week === day && p.period_number === num);
  const entryAt = (section: string, periodId: string) =>
    (entries ?? []).find((e) => e.section_id === section && e.period_id === periodId);

  const courseName = (id: string | null) => courses?.find((c) => c.id === id)?.code ?? "";
  const teacherName = (id: string | null) => teachers?.find((t) => t.id === id)?.name ?? "";
  const sectionName = (id: string) => {
    const s = sections?.find((x) => x.id === id);
    return s ? `${s.className} — ${s.name}` : "";
  };

  async function saveSlot(section: string, period: Period, course: string, teacher: string, room: string) {
    if (!tenant?.id) return false;
    const existing = entryAt(section, period.id);
    const payload = {
      tenant_id: tenant.id,
      campus_id: period.campus_id,
      section_id: section,
      period_id: period.id,
      course_id: course || null,
      teacher_id: teacher || null,
      room: room || null,
    };
    const res = existing
      ? await supabase.from("timetable_entries").update(payload).eq("id", existing.id)
      : await supabase.from("timetable_entries").insert(payload);
    if (res.error) {
      if (res.error.code === "23505") {
        toast.error(
          res.error.message.includes("teacher_slot")
            ? "Clash: this teacher is already booked in that period."
            : res.error.message.includes("room_slot")
              ? "Clash: this room is already occupied in that period."
              : "Clash: this slot is already filled.",
        );
      } else {
        toast.error(res.error.message);
      }
      return false;
    }
    toast.success(existing ? "Slot updated" : "Slot added");
    qc.invalidateQueries({ queryKey: ["timetable.entries", activeCampus] });
    return true;
  }

  async function clearSlot(entryId: string) {
    const { error } = await supabase.from("timetable_entries").delete().eq("id", entryId);
    if (error) return toast.error(error.message);
    toast.success("Slot cleared");
    qc.invalidateQueries({ queryKey: ["timetable.entries", activeCampus] });
  }

  function printGrid(kind: "section" | "teacher") {
    setPrinting(kind);
    setTimeout(() => {
      window.print();
      setPrinting(null);
    }, 100);
  }

  if (!activeCampus) {
    return (
      <div>
        <PageHeader eyebrow="Scheduling" title="Timetable" description="Create a campus first to build timetables." />
      </div>
    );
  }

  const printTitle =
    printing === "section" ? `Class Timetable — ${sectionName(activeSection)}` : printing === "teacher" ? `Teacher Timetable — ${teacherName(activeTeacher)}` : "";

  return (
    <div>
      <PageHeader
        eyebrow="Scheduling"
        title="Timetable"
        description="Build weekly timetables per section with automatic teacher and room clash detection."
        actions={
          <Select value={activeCampus} onValueChange={setCampusId}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Campus" /></SelectTrigger>
            <SelectContent>
              {(campuses ?? []).map((c) => (
                <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {/* Print header (visible only when printing) */}
      {printing && (
        <div className="hidden print:block mb-4">
          <div className="flex items-center gap-3">
            {tenant?.logo_url && <img src={tenant.logo_url} alt="" className="h-10 w-10 object-contain" />}
            <div>
              <div className="font-serif text-lg font-semibold">{tenant?.name}</div>
              <div className="text-sm">{printTitle}</div>
            </div>
          </div>
        </div>
      )}

      <Tabs defaultValue={isTeacherOnly ? "teacher" : "sections"}>
        <TabsList className="print:hidden">
          {!isTeacherOnly && <TabsTrigger value="sections">Section timetables</TabsTrigger>}
          <TabsTrigger value="teacher">Teacher timetables</TabsTrigger>
          {canEdit && <TabsTrigger value="periods">Periods</TabsTrigger>}
        </TabsList>

        {/* ------- Section timetables ------- */}
        <TabsContent value="sections" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-3 print:hidden">
            <Select value={activeSection} onValueChange={setSectionId}>
              <SelectTrigger className="w-64"><SelectValue placeholder="Select section" /></SelectTrigger>
              <SelectContent>
                {(sections ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.className} — {s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => printGrid("section")} disabled={!activeSection}>
              <Printer className="mr-2 h-4 w-4" /> Print
            </Button>
          </div>
          <TimetableGrid
            days={activeDays}
            periodNumbers={periodNumbers}
            periodAt={periodAt}
            renderCell={(period) => {
              if (!period) return <span className="text-muted-foreground/40">—</span>;
              if (period.is_break) return <span className="text-xs italic text-muted-foreground">{period.label ?? "Break"}</span>;
              const e = activeSection ? entryAt(activeSection, period.id) : undefined;
              if (!e) {
                return canEdit ? (
                  <button
                    type="button"
                    className="flex h-full w-full items-center justify-center text-muted-foreground/50 hover:text-foreground"
                    onClick={() => setSlotDialog({ sectionId: activeSection, period })}
                    aria-label="Add slot"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                ) : (
                  <span className="text-muted-foreground/40">—</span>
                );
              }
              return (
                <button
                  type="button"
                  className="block h-full w-full text-left"
                  onClick={() => canEdit && setSlotDialog({ sectionId: activeSection, period })}
                >
                  <div className="text-xs font-semibold">{courseName(e.course_id) || "—"}</div>
                  <div className="text-[11px] text-muted-foreground truncate">{teacherName(e.teacher_id)}</div>
                  {e.room && <div className="text-[10px] text-muted-foreground/70">Room {e.room}</div>}
                </button>
              );
            }}
          />
        </TabsContent>

        {/* ------- Teacher timetables ------- */}
        <TabsContent value="teacher" className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-3 print:hidden">
            {!isTeacherOnly && (
              <Select value={activeTeacher} onValueChange={setTeacherId}>
                <SelectTrigger className="w-64"><SelectValue placeholder="Select teacher" /></SelectTrigger>
                <SelectContent>
                  {(teachers ?? []).map((t) => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Button variant="outline" size="sm" onClick={() => printGrid("teacher")} disabled={!activeTeacher}>
              <Printer className="mr-2 h-4 w-4" /> Print
            </Button>
          </div>
          <TimetableGrid
            days={activeDays}
            periodNumbers={periodNumbers}
            periodAt={periodAt}
            renderCell={(period) => {
              if (!period) return <span className="text-muted-foreground/40">—</span>;
              if (period.is_break) return <span className="text-xs italic text-muted-foreground">{period.label ?? "Break"}</span>;
              const e = (entries ?? []).find((x) => x.period_id === period.id && x.teacher_id === activeTeacher);
              if (!e) return <span className="text-muted-foreground/40">Free</span>;
              return (
                <div>
                  <div className="text-xs font-semibold">{courseName(e.course_id) || "—"}</div>
                  <div className="text-[11px] text-muted-foreground truncate">{sectionName(e.section_id)}</div>
                  {e.room && <div className="text-[10px] text-muted-foreground/70">Room {e.room}</div>}
                </div>
              );
            }}
          />
        </TabsContent>

        {/* ------- Period setup ------- */}
        {canEdit && (
          <TabsContent value="periods" className="mt-4 space-y-4">
            <div className="flex justify-between print:hidden">
              <p className="text-sm text-muted-foreground">
                Define the weekly period structure for this campus. Timetable slots use these periods.
              </p>
              <Button size="sm" onClick={() => setPeriodDialog(true)}>
                <Plus className="mr-2 h-4 w-4" /> Add period
              </Button>
            </div>
            {periodList.length === 0 ? (
              <Card>
                <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
                  <CalendarDays className="h-8 w-8 text-muted-foreground/50" />
                  <p className="text-sm text-muted-foreground">
                    No periods yet. Add periods for each school day to start building timetables.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {activeDays.map((day) => (
                  <Card key={day}>
                    <CardContent className="p-4">
                      <div className="mb-2 font-medium">{DAYS[day]}</div>
                      <div className="space-y-1.5">
                        {periodList
                          .filter((p) => p.day_of_week === day)
                          .map((p) => (
                            <div key={p.id} className="flex items-center justify-between rounded-sm border px-2 py-1.5 text-sm">
                              <span>
                                {p.is_break ? (p.label ?? "Break") : `Period ${p.period_number}`}
                                <span className="ml-2 text-xs text-muted-foreground">
                                  {fmtTime(p.start_time)}–{fmtTime(p.end_time)}
                                </span>
                              </span>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                aria-label="Delete period"
                                onClick={async () => {
                                  const { error } = await supabase.from("timetable_periods").delete().eq("id", p.id);
                                  if (error) return toast.error(error.message);
                                  toast.success("Period deleted");
                                  qc.invalidateQueries({ queryKey: ["timetable.periods", activeCampus] });
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        )}
      </Tabs>

      {slotDialog && (
        <SlotDialog
          period={slotDialog.period}
          existing={entryAt(slotDialog.sectionId, slotDialog.period.id)}
          courses={courses ?? []}
          teachers={teachers ?? []}
          onClose={() => setSlotDialog(null)}
          onSave={async (course, teacher, room) => {
            const ok = await saveSlot(slotDialog.sectionId, slotDialog.period, course, teacher, room);
            if (ok) setSlotDialog(null);
          }}
          onClear={async (id) => {
            await clearSlot(id);
            setSlotDialog(null);
          }}
        />
      )}

      {periodDialog && (
        <PeriodDialog
          campusId={activeCampus}
          tenantId={tenant?.id ?? ""}
          onClose={() => setPeriodDialog(false)}
          onSaved={() => {
            setPeriodDialog(false);
            qc.invalidateQueries({ queryKey: ["timetable.periods", activeCampus] });
          }}
        />
      )}
    </div>
  );
}

function TimetableGrid({
  days,
  periodNumbers,
  periodAt,
  renderCell,
}: {
  days: number[];
  periodNumbers: number[];
  periodAt: (day: number, num: number) => Period | undefined;
  renderCell: (period: Period | undefined) => React.ReactNode;
}) {
  if (periodNumbers.length === 0) {
    return (
      <Card className="print:hidden">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          No period structure defined for this campus yet.
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="border bg-muted/50 px-3 py-2 text-left text-xs font-medium text-muted-foreground">Period</th>
            {days.map((d) => (
              <th key={d} className="border bg-muted/50 px-3 py-2 text-left text-xs font-medium text-muted-foreground">
                {DAYS[d]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {periodNumbers.map((num) => {
            const sample = days.map((d) => periodAt(d, num)).find(Boolean);
            return (
              <tr key={num} className={cn(sample?.is_break && "bg-muted/30")}>
                <td className="border px-3 py-2 align-top">
                  <div className="text-xs font-medium">
                    {sample?.is_break ? (sample.label ?? "Break") : `P${num}`}
                  </div>
                  {sample && (
                    <div className="text-[10px] text-muted-foreground">
                      {fmtTime(sample.start_time)}–{fmtTime(sample.end_time)}
                    </div>
                  )}
                </td>
                {days.map((d) => (
                  <td key={d} className="h-16 min-w-32 border px-2 py-1.5 align-top">
                    {renderCell(periodAt(d, num))}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SlotDialog({
  period,
  existing,
  courses,
  teachers,
  onClose,
  onSave,
  onClear,
}: {
  period: Period;
  existing: Entry | undefined;
  courses: CourseOpt[];
  teachers: TeacherOpt[];
  onClose: () => void;
  onSave: (course: string, teacher: string, room: string) => void;
  onClear: (id: string) => void;
}) {
  const [course, setCourse] = useState(existing?.course_id ?? "");
  const [teacher, setTeacher] = useState(existing?.teacher_id ?? "");
  const [room, setRoom] = useState(existing?.room ?? "");

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {DAYS[period.day_of_week]} · Period {period.period_number} ({fmtTime(period.start_time)}–{fmtTime(period.end_time)})
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Course</Label>
            <Select value={course} onValueChange={setCourse}>
              <SelectTrigger><SelectValue placeholder="Select course" /></SelectTrigger>
              <SelectContent>
                {courses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.code} — {c.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Teacher</Label>
            <Select value={teacher} onValueChange={setTeacher}>
              <SelectTrigger><SelectValue placeholder="Select teacher" /></SelectTrigger>
              <SelectContent>
                {teachers.map((t) => (
                  <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Room (optional)</Label>
            <Input value={room} onChange={(e) => setRoom(e.target.value)} placeholder="e.g. R-12" />
          </div>
          <p className="text-xs text-muted-foreground">
            The system blocks double-booking of teachers and rooms in the same period.
          </p>
        </div>
        <DialogFooter className="flex items-center justify-between sm:justify-between">
          <div>
            {existing && (
              <Button variant="destructive" size="sm" onClick={() => onClear(existing.id)}>
                Clear slot
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button onClick={() => onSave(course, teacher, room)} disabled={!course && !teacher}>
              {existing ? "Update" : "Add"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PeriodDialog({
  campusId,
  tenantId,
  onClose,
  onSaved,
}: {
  campusId: string;
  tenantId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [day, setDay] = useState("0");
  const [number, setNumber] = useState("1");
  const [start, setStart] = useState("08:00");
  const [end, setEnd] = useState("08:45");
  const [isBreak, setIsBreak] = useState(false);
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    const { error } = await supabase.from("timetable_periods").insert({
      tenant_id: tenantId,
      campus_id: campusId,
      day_of_week: Number(day),
      period_number: Number(number),
      start_time: start,
      end_time: end,
      is_break: isBreak,
      label: label || null,
    });
    setSaving(false);
    if (error) {
      if (error.code === "23505") return toast.error("That period number already exists on this day.");
      return toast.error(error.message);
    }
    toast.success("Period added");
    onSaved();
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add period</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Day</Label>
            <Select value={day} onValueChange={setDay}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DAYS.map((d, i) => (
                  <SelectItem key={i} value={String(i)}>{d}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Period number</Label>
            <Input type="number" min={1} value={number} onChange={(e) => setNumber(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Start time</Label>
            <Input type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>End time</Label>
            <Input type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
          </div>
          <div className="flex items-center gap-2 pt-5">
            <Checkbox id="is_break" checked={isBreak} onCheckedChange={(v) => setIsBreak(v === true)} />
            <Label htmlFor="is_break">This is a break</Label>
          </div>
          {isBreak && (
            <div className="space-y-1.5">
              <Label>Break label</Label>
              <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Lunch" />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Add period"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
