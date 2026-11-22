export type Track = "board" | "cambridge" | "both";
export type PickClass = { id: string; name: string; campus_id?: string | null; academic_system?: Track | null };
export type PickSection = { id: string; name: string; class_id: string };

/** Classes a student on this system may join. "both" shows every class. */
export function classesForSystem<T extends PickClass>(classes: T[], system: Track, campusId?: string | null): T[] {
  return classes
    .filter((c) => !campusId || !c.campus_id || c.campus_id === campusId)
    .filter((c) => system === "both" || !c.academic_system || c.academic_system === system || c.academic_system === "both")
    .sort((a, b) => trackRank(a.academic_system) - trackRank(b.academic_system) || a.name.localeCompare(b.name, undefined, { numeric: true }));
}

const trackRank = (t?: Track | null) => (t === "board" ? 0 : t === "cambridge" ? 1 : 2);

/** Only the sections of the chosen class. No class chosen → no sections. */
export function sectionsForClass<T extends PickSection>(sections: T[], classId: string | null | undefined): T[] {
  if (!classId) return [];
  return sections.filter((s) => s.class_id === classId).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
}
