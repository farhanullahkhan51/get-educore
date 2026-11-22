import { useState } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { classesForSystem, sectionsForClass, type PickClass, type PickSection, type Track } from "@/lib/class-sections";
import { SECTION_FULL_HINT } from "@/lib/section-capacity";

type Cap = { get: (id: string) => { full: boolean } | null | undefined; label: (id: string) => string };

/** Campus → academic system → class → section, where each list only shows what fits the choice above it. */
export function ClassSectionFields({
  campuses, classes, sections, capacity, initial, onChange,
}: {
  campuses: { id: string; name: string }[];
  classes: PickClass[];
  sections: PickSection[];
  capacity: Cap;
  initial?: { campus_id?: string | null; academic_system?: Track | null; class_id?: string | null; section_id?: string | null };
  onChange?: () => void;
}) {
  const [campusId, setCampusId] = useState(initial?.campus_id ?? (campuses.length === 1 ? campuses[0]!.id : ""));
  const [system, setSystem] = useState<Track>(initial?.academic_system ?? "board");
  const [classId, setClassId] = useState(initial?.class_id ?? "");
  const [sectionId, setSectionId] = useState(initial?.section_id ?? "");
  const keepSection = initial?.section_id ?? null;

  const visibleClasses = classesForSystem(classes, system, campusId || null);
  const visibleSections = sectionsForClass(sections, classId);
  const changed = () => onChange?.();
  const group = (t: Track) => visibleClasses.filter((c) => (c.academic_system ?? "board") === t);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Campus</Label>
          <Select name="campus_id" required value={campusId} onValueChange={(v) => { setCampusId(v); setClassId(""); setSectionId(""); changed(); }}>
            <SelectTrigger><SelectValue placeholder="Campus" /></SelectTrigger>
            <SelectContent>{campuses.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Academic system</Label>
          <Select name="academic_system" value={system} onValueChange={(v) => { setSystem(v as Track); setClassId(""); setSectionId(""); changed(); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="board">Board</SelectItem>
              <SelectItem value="cambridge">Cambridge</SelectItem>
              <SelectItem value="both">Both</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Class / grade</Label>
          <Select name="class_id" value={classId} onValueChange={(v) => { setClassId(v); setSectionId(""); changed(); }}>
            <SelectTrigger><SelectValue placeholder={visibleClasses.length ? "Choose grade" : "No grades for this choice"} /></SelectTrigger>
            <SelectContent>
              {system === "both"
                ? (["board", "cambridge", "both"] as Track[]).map((t) => group(t).length ? (
                    <SelectGroup key={t}>
                      <SelectLabel>{t === "board" ? "Board" : t === "cambridge" ? "Cambridge" : "Both systems"}</SelectLabel>
                      {group(t).map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                    </SelectGroup>
                  ) : null)
                : visibleClasses.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Section</Label>
          <Select name="section_id" value={sectionId} disabled={!classId} onValueChange={(v) => { setSectionId(v); changed(); }}>
            <SelectTrigger><SelectValue placeholder={classId ? (visibleSections.length ? "Choose section" : "No sections in this grade") : "Choose a grade first"} /></SelectTrigger>
            <SelectContent>
              {visibleSections.map((s) => {
                const cap = capacity.get(s.id);
                return (
                  <SelectItem key={s.id} value={s.id} disabled={!!cap?.full && s.id !== keepSection}>
                    {s.name}{cap ? ` — ${capacity.label(s.id)}` : ""}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">{SECTION_FULL_HINT}</p>
        </div>
      </div>
    </div>
  );
}
