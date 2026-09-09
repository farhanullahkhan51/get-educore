import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetch-all";

export type SectionCapacity = {
  id: string;
  name: string;
  class_id: string;
  capacity: number;
  used: number;
  free: number;
  full: boolean;
};

type SectionRow = { id: string; name: string; class_id: string; capacity: number | null };
type StudentRow = { id: string; section_id: string | null; status: string | null };

/**
 * Live places left in every section, so pickers can refuse a section that is
 * already full instead of letting the save fail in the database.
 */
export function useSectionCapacity() {
  const { data, isLoading } = useQuery({
    queryKey: ["section-capacity"],
    queryFn: async () => {
      const [sections, students] = await Promise.all([
        supabase.from("sections").select("id, name, class_id, capacity").order("name"),
        fetchAllRows<StudentRow>((from, to) =>
          supabase
            .from("students")
            .select("id, section_id, status")
            .order("id")
            .range(from, to) as never,
        ),
      ]);
      const rows = (sections.data ?? []) as SectionRow[];
      const counts = new Map<string, number>();
      for (const s of students) {
        if (!s.section_id) continue;
        if ((s.status ?? "active") !== "active") continue;
        counts.set(s.section_id, (counts.get(s.section_id) ?? 0) + 1);
      }
      return rows.map((s) => {
        const capacity = s.capacity ?? 40;
        const used = counts.get(s.id) ?? 0;
        return {
          id: s.id,
          name: s.name,
          class_id: s.class_id,
          capacity,
          used,
          free: Math.max(0, capacity - used),
          full: used >= capacity,
        } satisfies SectionCapacity;
      });
    },
  });

  const list = data ?? [];
  const byId = new Map(list.map((s) => [s.id, s]));
  return {
    isLoading,
    list,
    byId,
    get: (id: string | null | undefined) => (id ? byId.get(id) ?? null : null),
    /** "Blue — 4 places free" / "Blue — full (30 of 30)" */
    label: (id: string) => {
      const s = byId.get(id);
      if (!s) return "";
      return s.full ? `full (${s.used} of ${s.capacity})` : `${s.free} place${s.free === 1 ? "" : "s"} free`;
    },
  };
}

export const SECTION_FULL_HINT =
  "This section is full. Create another section for the same grade, or add more chairs to this one so everyone is seated.";
