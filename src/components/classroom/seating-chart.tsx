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
        .select("id, student_code, first_name, last_name, class_id, section_id, guardian_name, campus_id")
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

  function refresh() {
    qc.invalidateQueries({ queryKey: ["section-seats", section.id] });
    qc.invalidateQueries({ queryKey: ["seating-students", section.class_id, section.id] });
    qc.invalidateQueries({ queryKey: ["class-students"] });
    qc.invalidateQueries({ queryKey: ["sections"] });
  }

  async function seatStudent(studentId: string, seatIndex: number) {
    setBusy(true);
    const existing = seatByIndex.get(seatIndex);
    const current = (seats ?? []).find((s) => s.student_id === studentId);
    try {
      if (existing && existing.student_id === studentId) return;
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
    const rows = unseated.slice(0, free.length).map((st, i) => ({
      tenant_id: section.tenant_id,
      campus_id: section.campus_id,
      section_id: section.id,
      seat_index: free[i],
      student_id: st.id,
    }));
    if (rows.length === 0) return toast.info("Nothing to seat");
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
          <div className="mt-2 max-h-[320px] space-y-1 overflow-y-auto pr-1">
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

      <div className="rounded-xl border bg-muted/30 p-4">
        <div className="mx-auto mb-4 flex h-10 max-w-md items-center justify-center rounded-md border-2 border-foreground/20 bg-background text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Board
        </div>
        <div className="mx-auto mb-6 flex max-w-xs items-center gap-2 rounded-md border bg-background px-3 py-2 text-xs">
          <Presentation className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="truncate">
            {teacher ? `${teacher.first_name} ${teacher.last_name}` : "Teacher's desk — unassigned"}
          </span>
        </div>

        <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {Array.from({ length: capacity }).map((_, i) => {
            const seat = seatByIndex.get(i);
            const st = seat ? studentById.get(seat.student_id) : undefined;
            const active = picked?.type === "seat" && picked.seatIndex === i;
            return (
              <div
                key={i}
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => onSeatDrop(e, i)}
                onClick={() => onSeatClick(i)}
                draggable={!!seat}
                onDragStart={(e) => seat && e.dataTransfer.setData("text/student", seat.student_id)}
                title={st ? `${st.first_name} ${st.last_name} · ${st.student_code}${st.guardian_name ? ` · ${st.guardian_name}` : ""}` : `Seat ${i + 1}`}
                className={`group relative flex aspect-square cursor-pointer flex-col items-center justify-center rounded-lg border p-1 text-center transition-colors ${
                  seat ? "border-primary/40 bg-primary/10" : "border-dashed bg-background hover:bg-muted"
                } ${active ? "ring-2 ring-primary" : ""}`}
              >
                {st ? (
                  <>
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/20 text-[10px] font-semibold">
                      {initials(st)}
                    </span>
                    <span className="mt-1 line-clamp-2 text-[10px] leading-tight">{st.first_name}</span>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); void unseat(seat!); }}
                      className="absolute right-0.5 top-0.5 hidden rounded p-0.5 text-muted-foreground hover:bg-background group-hover:block"
                      aria-label="Remove from seat"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </>
                ) : (
                  <>
                    <Armchair className="h-4 w-4 text-muted-foreground/60" />
                    <span className="mt-1 text-[10px] text-muted-foreground/60">{i + 1}</span>
                  </>
                )}
              </div>
            );
          })}
        </div>
        <p className="mt-4 flex items-center gap-1 text-[11px] text-muted-foreground">
          <UserRound className="h-3 w-3" /> Drag a student onto a chair, or tap a student then tap a chair. {className} · {section.room ?? "no room"}
        </p>
      </div>
    </div>
  );
}
