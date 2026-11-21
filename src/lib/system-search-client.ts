import { supabase } from "@/integrations/supabase/client";
import { searchWords, type SearchRecord, type SearchSource } from "./system-search";

export async function searchSystem(sources: SearchSource[], query: string, limit: number, signal: AbortSignal) {
  const words = searchWords(query);
  if (!words.length) return { records: [] as SearchRecord[], failed: [] as string[], more: false };
  const failed = new Set<string>();
  const related = new Map<string, string[]>();
  let more = false;
  async function run(source: SearchSource, includeRelated: boolean): Promise<SearchRecord[]> {
    const groups = words.map((word) => {
      const conditions = source.text.map((field) => `${field}.ilike.*${word}*`);
      if (/^-?\d+(\.\d+)?$/.test(word)) {
        conditions.push(...source.numbers.map((field) => `${field}.eq.${Number(word)}`));
      }
      for (const [field, values] of Object.entries(source.enums)) {
        const match = values.find((value) => value.toLowerCase() === word.toLowerCase());
        if (match) conditions.push(`${field}.eq.${match}`);
      }
      const parsed = new Date(`${word}T00:00:00Z`);
      if (/^\d{4}-\d{2}-\d{2}$/.test(word) && !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(word)) {
        for (const [field, type] of Object.entries(source.dates)) {
          if (type === "date") conditions.push(`${field}.eq.${word}`);
          if (type === "timestamp with time zone") {
            const tomorrow = new Date(parsed.getTime() + 86400000).toISOString();
            conditions.push(`and(${field}.gte.${word}T00:00:00Z,${field}.lt.${tomorrow})`);
          }
        }
      }
      return conditions.length ? `or(${conditions.join(",")})` : "";
    });
    const filters: string[] = groups.every(Boolean) ? [`and(${groups.join(",")})`] : [];
    if (includeRelated) {
      for (const field of source.refs) {
        const table = field === "student_id" ? "students" : ["staff_id", "teacher_id", "absent_teacher_id", "proxy_teacher_id"].includes(field) ? "staff" : field === "course_id" ? "courses" : field === "section_id" ? "sections" : field === "class_id" ? "classes" : field === "challan_id" ? "fee_challans" : field === "registration_id" ? (source.table.startsWith("board") ? "board_registrations" : "cambridge_registrations") : field === "entry_id" ? (source.table.startsWith("board") ? "board_exam_entries" : "cambridge_subject_entries") : "";
        const ids = related.get(table);
        if (ids?.length) filters.push(`${field}.in.(${ids.join(",")})`);
      }
    }
    if (!filters.length) return [];
    const columns = ["id", ...source.text, ...Object.keys(source.enums), ...Object.keys(source.dates), ...source.numbers, ...source.refs];
    const { data, error } = await supabase.from(source.table).select(columns.join(",")).or(filters.join(",")).order("id").limit(limit + 1).abortSignal(signal);
    if (signal.aborted) return [];
    if (error) { failed.add(source.label); return []; }
    if ((data?.length ?? 0) > limit) more = true;
    const rows = (data ?? []) as unknown as Record<string, unknown>[];
    return rows.slice(0, limit).flatMap((fields) => typeof fields["id"] === "string" ? [{ id: fields["id"], source, fields }] : []);
  }
  const roots = sources.filter((s) => ["students", "staff", "courses", "classes", "sections", "fee_challans", "board_registrations", "cambridge_registrations", "board_exam_entries", "cambridge_subject_entries"].includes(s.table));
  const rootResults = await Promise.all(roots.map((s) => run(s, false)));
  rootResults.forEach((rows, index) => { const source = roots[index]; if (source) related.set(source.table, rows.map((r) => r.id)); });
  const results = await Promise.all(sources.map((s) => s.refs.length || !roots.includes(s) ? run(s, true) : Promise.resolve(rootResults[roots.indexOf(s)] ?? [])));
  results.forEach((rows, index) => { const source = sources[index]; if (source) related.set(source.table, rows.map((r) => r.id)); });
  // Follow one more level for fee ledger and exam results linked through a matched registration/challan.
  await Promise.all(sources.map(async (source, index) => {
    if (source.refs.some((field) => ["entry_id", "registration_id", "challan_id"].includes(field))) results[index] = await run(source, true);
  }));
  const allRecords = results.flat();
  const nameLookups = [
    { table: "students", fields: ["student_id"], columns: "id, first_name, last_name, student_code", title: (f: Record<string, unknown>) => `${f["first_name"]} ${f["last_name"]} · ${f["student_code"]}` },
    { table: "staff", fields: ["staff_id", "teacher_id", "absent_teacher_id", "proxy_teacher_id"], columns: "id, first_name, last_name, staff_code", title: (f: Record<string, unknown>) => `${f["first_name"]} ${f["last_name"]} · ${f["staff_code"]}` },
    { table: "courses", fields: ["course_id"], columns: "id, title, code", title: (f: Record<string, unknown>) => `${f["title"]} · ${f["code"]}` },
    { table: "sections", fields: ["section_id"], columns: "id, name", title: (f: Record<string, unknown>) => String(f["name"]) },
    { table: "classes", fields: ["class_id"], columns: "id, name", title: (f: Record<string, unknown>) => String(f["name"]) },
  ] as const;
  await Promise.all(nameLookups.map(async (lookup) => {
    const ids = [...new Set(allRecords.flatMap((r) => lookup.fields.flatMap((field) => typeof r.fields[field] === "string" ? [String(r.fields[field])] : [])))];
    if (!ids.length || signal.aborted) return;
    const { data } = await supabase.from(lookup.table).select(lookup.columns).in("id", ids).abortSignal(signal);
    const names = new Map(((data ?? []) as unknown as Record<string, unknown>[]).map((f) => [String(f["id"]), lookup.title(f)]));
    for (const record of allRecords) {
      for (const field of lookup.fields) {
        const name = names.get(String(record.fields[field]));
        if (name) record.fields[field.replace(/_id$/, "")] = name;
      }
    }
  }));
  // Do not display internal identifiers in the preview.
  for (const record of allRecords) for (const field of record.source.refs) delete record.fields[field];
  return { records: allRecords, failed: [...failed], more };
}