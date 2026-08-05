import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Armchair, Presentation, RotateCcw, Sparkles, UserRound, X } from "lucide-react";

export type SeatSection = {
  id: string;
  tenant_id: string;
  campus_id: string;
  class_id: string;
  name: string;
  capacity: number | null;
  room: string | null;
  class_teacher_id?: string | null;
  academic_system?: "board" | "cambridge" | "both" | null;
};

type Seat = { id: string; seat_index: number; student_id: string };
type Student = {
  id: string;
  student_code: string;
  first_name: string;
  last_name: string;
  class_id: string | null;
  section_id: string | null;
  guardian_name: string | null;
  campus_id: string;
  status?: string | null;
  academic_system?: "board" | "cambridge" | "both" | null;
};

function initials(s: Student) {
  return `${s.first_name[0] ?? ""}${s.last_name[0] ?? ""}`.toUpperCase();
}

export function SeatingChart({ section, className }: { section: SeatSection; className: string }) {
  const qc = useQueryClient();
  const capacity = section.capacity ?? 40;
  const [picked, setPicked] = useState<{ type: "student" | "seat"; id: string; seatIndex?: number } | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: seats } = useQuery({
    queryKey: ["section-seats", section.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("section_seats")
        .select("id, seat_index, student_id")
        .eq("section_id", section.id);
      if (error) throw error;
      return (data ?? []) as Seat[];
    },
  });

  const { data: students } = useQuery({
    queryKey: ["seating-students", section.class_id, section.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("students")
        .select(
          "id, student_code, first_name, last_name, class_id, section_id, guardian_name, campus_id, status, academic_system",
        )
        .or(`class_id.eq.${section.class_id},section_id.eq.${section.id}`)
        .order("first_name");
      if (error) throw error;
      return (data ?? []) as Student[];
    },
  });

  const { data: staff } = useQuery({
    queryKey: ["seating-staff", section.campus_id],
    queryFn: async () => {
      const { data } = await supabase
        .from("staff")
        .select("id, first_name, last_name, designation")
        .eq("campus_id", section.campus_id)
        .order("first_name");
      return data ?? [];
    },
  });

  const seatByIndex = useMemo(() => new Map((seats ?? []).map((s) => [s.seat_index, s])), [seats]);
  const studentById = useMemo(() => new Map((students ?? []).map((s) => [s.id, s])), [students]);
  const seatedIds = useMemo(() => new Set((seats ?? []).map((s) => s.student_id)), [seats]);
  const unseated = (students ?? []).filter((s) => !seatedIds.has(s.id));
  const cols = Math.min(8, Math.max(4, Math.ceil(Math.sqrt(capacity))));

  /** Returns a reason string when the student cannot take this seat, otherwise null. */
  function seatingError(studentId: string, seatIndex: number): string | null {
    const st = studentById.get(studentId);
    if (!st) return "That student is not part of this class.";
    if (seatIndex < 0 || seatIndex >= capacity) return `This room only has ${capacity} seats.`;
    if (st.campus_id !== section.campus_id) return `${st.first_name} belongs to a different campus.`;
    if (st.status && st.status !== "active") return `${st.first_name} is ${st.status} and cannot be seated.`;
    if (
      section.academic_system &&
      section.academic_system !== "both" &&
      st.academic_system &&
      st.academic_system !== "both" &&
      st.academic_system !== section.academic_system
    ) {
      return `${st.first_name} is on the ${st.academic_system} track — this section is ${section.academic_system}.`;
    }
    const occupant = seatByIndex.get(seatIndex);
    const alreadySeated = seatedIds.has(studentId);
    if (occupant && occupant.student_id !== studentId && !alreadySeated) {
      const other = studentById.get(occupant.student_id);
      return `Seat ${seatIndex + 1} is taken${other ? ` by ${other.first_name}` : ""}. Free it first, or drag a seated student onto it to swap.`;
    }
    if (!occupant && !alreadySeated && (seats?.length ?? 0) >= capacity) return "The classroom is full.";
    return null;
  }

  function refresh() {
    qc.invalidateQueries({ queryKey: ["section-seats", section.id] });
    qc.invalidateQueries({ queryKey: ["seating-students", section.class_id, section.id] });
    qc.invalidateQueries({ queryKey: ["class-students"] });
    qc.invalidateQueries({ queryKey: ["sections"] });
  }

  async function seatStudent(studentId: string, seatIndex: number) {
    const existing = seatByIndex.get(seatIndex);
    if (existing && existing.student_id === studentId) {
      setPicked(null);
      return;
    }
    const problem = seatingError(studentId, seatIndex);
    if (problem) {
      toast.error(problem);
      setPicked(null);
      return;
    }
    setBusy(true);
    const current = (seats ?? []).find((s) => s.student_id === studentId);
    try {
      if (existing) {
        // swap or evict
        if (current) {
          await supabase.from("section_seats").delete().eq("id", existing.id);
          await supabase.from("section_seats").update({ seat_index: seatIndex }).eq("id", current.id);
          const { error } = await supabase.from("section_seats").insert({
            tenant_id: section.tenant_id,
            campus_id: section.campus_id,
            section_id: section.id,
            seat_index: current.seat_index,
            student_id: existing.student_id,
          });
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from("section_seats")
            .update({ student_id: studentId })
            .eq("id", existing.id);
          if (error) throw error;
        }
      } else if (current) {
        const { error } = await supabase.from("section_seats").update({ seat_index: seatIndex }).eq("id", current.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("section_seats").insert({
          tenant_id: section.tenant_id,
          campus_id: section.campus_id,
          section_id: section.id,
          seat_index: seatIndex,
          student_id: studentId,
        });
        if (error) throw error;
      }
      await supabase.from("students").update({ section_id: section.id, class_id: section.class_id }).eq("id", studentId);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not seat student");
    } finally {
      setBusy(false);
      setPicked(null);
    }
  }

  async function unseat(seat: Seat) {
    setBusy(true);
    const { error } = await supabase.from("section_seats").delete().eq("id", seat.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    refresh();
  }

  async function autoFill() {
    const free: number[] = [];
    for (let i = 0; i < capacity; i++) if (!seatByIndex.has(i)) free.push(i);
    const eligible = unseated.filter((st) => !seatingError(st.id, free[0] ?? 0));
    const skipped = unseated.length - eligible.length;
    const rows = eligible.slice(0, free.length).map((st, i) => ({
      tenant_id: section.tenant_id,
      campus_id: section.campus_id,
      section_id: section.id,
      seat_index: free[i],
      student_id: st.id,
    }));
    if (rows.length === 0) return toast.info(skipped > 0 ? "No eligible students to seat" : "Nothing to seat");
    if (skipped > 0) toast.warning(`${skipped} student(s) skipped — campus, track, or status mismatch`);
    setBusy(true);
    const { error } = await supabase.from("section_seats").insert(rows);
    if (!error) {
      await supabase
        .from("students")
        .update({ section_id: section.id, class_id: section.class_id })
        .in("id", rows.map((r) => r.student_id));
    }
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Seated ${rows.length} student${rows.length === 1 ? "" : "s"}`);
    refresh();
  }

  async function clearAll() {
    if (!confirm("Clear all seating for this section?")) return;
    setBusy(true);
    const { error } = await supabase.from("section_seats").delete().eq("section_id", section.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    refresh();
  }

  async function assignTeacher(id: string) {
    const { error } = await supabase
      .from("sections")
      .update({ class_teacher_id: id === "none" ? null : id })
      .eq("id", section.id);
    if (error) return toast.error(error.message);
    toast.success("Class teacher updated");
    qc.invalidateQueries({ queryKey: ["sections"] });
  }

  const teacher = staff?.find((s) => s.id === section.class_teacher_id);

  function onSeatDrop(e: React.DragEvent, seatIndex: number) {
    e.preventDefault();
    const studentId = e.dataTransfer.getData("text/student");
    if (studentId) void seatStudent(studentId, seatIndex);
  }

  function onSeatClick(seatIndex: number) {
    const occupant = seatByIndex.get(seatIndex);
    if (picked?.type === "student") return void seatStudent(picked.id, seatIndex);
    if (picked?.type === "seat" && picked.seatIndex !== seatIndex) return void seatStudent(picked.id, seatIndex);
    if (occupant) setPicked({ type: "seat", id: occupant.student_id, seatIndex });
    else setPicked(null);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[260px_1fr]">
      <div className="space-y-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Class teacher</p>
          <Select value={section.class_teacher_id ?? "none"} onValueChange={assignTeacher}>
            <SelectTrigger className="mt-2"><SelectValue placeholder="Assign teacher" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">— Unassigned —</SelectItem>
              {staff?.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.first_name} {s.last_name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Unseated</p>
            <span className="text-xs text-muted-foreground">{seats?.length ?? 0} / {capacity} seated</span>
          </div>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData("text/student");
              const seat = (seats ?? []).find((s) => s.student_id === id);
              if (seat) void unseat(seat);
            }}
            className="mt-2 max-h-[320px] space-y-1 overflow-y-auto rounded-md border border-dashed p-1"
          >
            {unseated.length === 0 && <p className="text-xs text-muted-foreground">Everyone has a seat.</p>}
            {unseated.map((st) => {
              const active = picked?.type === "student" && picked.id === st.id;
              return (
                <button
                  key={st.id}
                  type="button"
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("text/student", st.id)}
                  onClick={() => setPicked(active ? null : { type: "student", id: st.id })}
                  className={`flex w-full cursor-grab items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition-colors ${
                    active ? "border-primary bg-primary/10" : "hover:bg-muted"
                  }`}
                >
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
                    {initials(st)}
                  </span>
                  <span className="truncate">
                    <span className="font-medium">{st.first_name} {st.last_name}</span>
                    <span className="block font-mono text-[10px] text-muted-foreground">{st.student_code}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={busy} onClick={autoFill}>
            <Sparkles className="mr-1 h-3 w-3" /> Auto-fill
          </Button>
          <Button size="sm" variant="outline" disabled={busy} onClick={clearAll}>
            <RotateCcw className="mr-1 h-3 w-3" /> Clear
          </Button>
        </div>
        {picked && (
          <p className="text-xs text-muted-foreground">
            Now tap a seat to place {picked.type === "student"
              ? studentById.get(picked.id)?.first_name
              : studentById.get(picked.id)?.first_name}.
          </p>
        )}
      </div>

      <div
        className="overflow-x-auto rounded-xl border p-4"
        style={{ background: "linear-gradient(to bottom, var(--classroom-wall), var(--classroom-floor))" }}
      >
        <div style={{ perspective: "1400px" }}>
          <div
            className="mx-auto min-w-[560px] origin-top"
            style={{ transform: "rotateX(16deg)", transformStyle: "preserve-3d" }}
          >
            {/* back wall: board + teacher desk (top-left) */}
            <div className="mb-6 flex items-end gap-4">
              <TeacherDesk name={teacher ? `${teacher.first_name} ${teacher.last_name}` : null} />
              <div
                className="mb-2 flex h-16 flex-1 items-center justify-center rounded-md text-xs font-semibold uppercase tracking-[0.25em] text-white/80 shadow-inner"
                style={{
                  background: "var(--classroom-board)",
                  border: "6px solid var(--classroom-wood-dark)",
                  boxShadow: "inset 0 4px 14px rgba(0,0,0,0.35)",
                }}
              >
                {className}
              </div>
            </div>

            {/* seat rows: pairs of 2, 10 per row */}
            <div className="space-y-5">
              {Array.from({ length: Math.max(3, Math.ceil(capacity / 10)) }).map((_, row) => {
                const seatsInRow = Math.max(0, Math.min(10, capacity - row * 10));
                if (seatsInRow === 0) return null;
                const depth = 1 + row * 0.06;
                return (
                  <div
                    key={row}
                    className="flex justify-center gap-6"
                    style={{ transform: `scale(${depth})`, transformOrigin: "center top" }}
                  >
                    {Array.from({ length: Math.ceil(seatsInRow / 2) }).map((_, pair) => (
                      <div key={pair} className="flex gap-1.5">
                        {Array.from({ length: Math.min(2, seatsInRow - pair * 2) }).map((__, k) => {
                          const i = row * 10 + pair * 2 + k;
                          const seat = seatByIndex.get(i);
                          const st = seat ? studentById.get(seat.student_id) : undefined;
                          const active = picked?.type === "seat" && picked.seatIndex === i;
                          const unavailable = picked ? !!seatingError(picked.id, i) : false;
                          return (
                            <ChairSeat
                              key={i}
                              index={i}
                              student={st}
                              active={active}
                              unavailable={unavailable}
                              onClick={() => onSeatClick(i)}
                              onDrop={(e) => onSeatDrop(e, i)}
                              draggable={!!seat}
                              onDragStart={(e) => seat && e.dataTransfer.setData("text/student", seat.student_id)}
                              onRemove={seat ? () => void unseat(seat) : undefined}
                            />

                          );
                        })}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <p className="mt-6 flex items-center gap-1 text-[11px] text-muted-foreground">
          <UserRound className="h-3 w-3" /> Drag a student onto a chair, or tap a student then tap a chair. {className} ·{" "}
          {section.room ?? "no room"}
        </p>
      </div>
    </div>
  );
}

function TeacherDesk({ name }: { name: string | null }) {
  return (
    <div className="flex w-40 shrink-0 flex-col items-center">
      <div
        className="flex h-8 w-8 items-center justify-center rounded-full text-[10px] font-bold text-white shadow"
        style={{ background: "var(--classroom-wood-dark)" }}
      >
        <Presentation className="h-4 w-4" />
      </div>
      <div
        className="mt-1 h-3 w-24 rounded-t-sm"
        style={{ background: "var(--classroom-wood-light)" }}
      />
      <div
        className="h-9 w-36 rounded-md shadow-md"
        style={{
          background: "linear-gradient(to bottom, var(--classroom-wood-light), var(--classroom-wood))",
          borderBottom: "5px solid var(--classroom-wood-dark)",
        }}
      />
      <span className="mt-1 max-w-36 truncate text-[10px] font-medium text-muted-foreground">
        {name ?? "Teacher's desk"}
      </span>
    </div>
  );
}

function ChairSeat({
  index,
  student,
  active,
  unavailable,
  onClick,
  onDrop,
  draggable,
  onDragStart,
  onRemove,
}: {
  index: number;
  student?: Student;
  active: boolean;
  unavailable?: boolean;
  onClick: () => void;
  onDrop: (e: React.DragEvent) => void;
  draggable: boolean;
  onDragStart: (e: React.DragEvent) => void;
  onRemove?: () => void;
}) {
  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      onClick={onClick}
      draggable={draggable}
      onDragStart={onDragStart}
      title={
        student
          ? `${student.first_name} ${student.last_name} · ${student.student_code}${student.guardian_name ? ` · ${student.guardian_name}` : ""}`
          : `Seat ${index + 1}`
      }
      className={`group relative flex w-14 cursor-pointer flex-col items-center rounded-md p-1 transition-transform hover:-translate-y-1 ${
        active ? "ring-2 ring-primary" : ""
      }`}
    >
      {/* desk top */}
      <div
        className="h-2.5 w-12 rounded-t-sm shadow-sm"
        style={{
          background: "linear-gradient(to bottom, var(--classroom-wood-light), var(--classroom-wood))",
          borderBottom: "3px solid var(--classroom-wood-dark)",
        }}
      />
      {/* occupant / chair back */}
      <div className="relative -mt-0.5 flex h-9 w-10 items-end justify-center">
        <div
          className="absolute bottom-2 h-6 w-7 rounded-t-md"
          style={{
            background: "linear-gradient(to bottom, var(--classroom-wood), var(--classroom-wood-dark))",
          }}
        />
        {student && (
          <span
            className="absolute bottom-4 flex h-6 w-6 items-center justify-center rounded-full border-2 border-background text-[9px] font-bold text-primary-foreground shadow"
            style={{ background: "var(--primary)" }}
          >
            {initials(student)}
          </span>
        )}
        {/* seat */}
        <div
          className="absolute bottom-1 h-2 w-9 rounded-sm"
          style={{ background: "var(--classroom-wood-light)" }}
        />
        {/* legs */}
        <div className="absolute bottom-0 flex w-9 justify-between">
          <span className="h-1.5 w-1" style={{ background: "var(--classroom-wood-dark)" }} />
          <span className="h-1.5 w-1" style={{ background: "var(--classroom-wood-dark)" }} />
        </div>
      </div>
      <span className="mt-0.5 max-w-14 truncate text-[9px] leading-none text-muted-foreground">
        {student ? student.first_name : index + 1}
      </span>
      {!student && <Armchair className="sr-only h-0 w-0" />}
      {onRemove && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="absolute -right-1 -top-1 hidden rounded-full bg-background p-0.5 text-muted-foreground shadow group-hover:block"
          aria-label="Remove from seat"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}
