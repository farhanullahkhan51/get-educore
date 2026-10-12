import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Printer, ChevronLeft, ChevronRight } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { DUE_LABEL, HOMEWORK_KINDS, addDays, dueState, groupBySubject, localToday } from "@/lib/homework";

export const Route = createFileRoute("/_authenticated/homework")({
  head: () => ({
    meta: [
      { title: "Homework & Daily Diary" },
      { name: "description", content: "Post daily homework and diary notes per section; students and parents see them in the portal." },
      { property: "og:title", content: "Homework & Daily Diary" },
      { property: "og:description", content: "Digital daily diary for every class and section." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HomeworkPage,
});

type Entry = {
  id: string; section_id: string; course_id: string | null; subject: string; kind: string;
  title: string; details: string; assigned_on: string; due_on: string | null; attachment_url: string | null;
  created_by: string | null;
};
type Form = Omit<Entry, "id" | "created_by"> & { id?: string; copyTo: string[] };

function HomeworkPage() {
  const { data: user } = useCurrentUser();
  const qc = useQueryClient();
  const today = localToday();
  const [date, setDate] = useState(today);
  const [sectionId, setSectionId] = useState<string>("all");
  const [form, setForm] = useState<Form | null>(null);
  const [saving, setSaving] = useState(false);
  const isAdmin = !!user?.roles.some((r) => r === "super_admin" || r === "campus_admin");

  const { data: sections = [] } = useQuery({
    queryKey: ["hw-sections"],
    queryFn: async () => {
      const { data, error } = await supabase.from("sections").select("id,name,class_id,class:class_id(name)").order("name");
      if (error) throw error;
      return (data ?? []).map((s: any) => ({ id: s.id as string, class_id: s.class_id as string, label: `${s.class?.name ?? ""} ${s.name}`.trim() }))
        .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }));
    },
  });
  const secLabel = useMemo(() => new Map(sections.map((s) => [s.id, s.label])), [sections]);

  const { data: courses = [] } = useQuery({
    queryKey: ["hw-courses"],
    queryFn: async () => (await supabase.from("courses").select("id,code,title,class_id").eq("is_active", true).order("title")).data ?? [],
  });

  const { data: entries = [], isLoading } = useQuery({
    queryKey: ["homework", date, sectionId],
    queryFn: async () => {
      let q = supabase.from("homework_entries").select("*").eq("assigned_on", date).order("subject");
      if (sectionId !== "all") q = q.eq("section_id", sectionId);
      const { data, error } = await q.limit(1000);
      if (error) throw error;
      return data as Entry[];
    },
  });

  const bySection = useMemo(() => {
    const m = new Map<string, Entry[]>();
    for (const e of entries) { if (!m.has(e.section_id)) m.set(e.section_id, []); m.get(e.section_id)!.push(e); }
    return [...m.entries()].sort((a, b) => (secLabel.get(a[0]) ?? "").localeCompare(secLabel.get(b[0]) ?? "", undefined, { numeric: true }));
  }, [entries, secLabel]);

  const openNew = () => setForm({
    section_id: sectionId !== "all" ? sectionId : "", course_id: null, subject: "", kind: "homework",
    title: "", details: "", assigned_on: date, due_on: addDays(date, 1), attachment_url: "", copyTo: [],
  });

  const save = async () => {
    if (!form) return;
    if (!form.section_id || !form.title.trim() || !form.subject.trim()) return toast.error("Section, subject and title are required.");
    if (form.due_on && form.due_on < form.assigned_on) return toast.error("Due date can't be before the assigned date.");
    if (form.attachment_url && !/^https?:\/\//i.test(form.attachment_url)) return toast.error("Worksheet link must start with http:// or https://");
    setSaving(true);
    const base = {
      course_id: form.course_id, subject: form.subject.trim(), kind: form.kind, title: form.title.trim(),
      details: form.details.trim(), assigned_on: form.assigned_on, due_on: form.due_on || null,
      attachment_url: form.attachment_url?.trim() || null,
    };
    const res = form.id
      ? await supabase.from("homework_entries").update({ ...base, section_id: form.section_id }).eq("id", form.id)
      : await supabase.from("homework_entries").insert(
          [form.section_id, ...form.copyTo.filter((s) => s !== form.section_id)].map((s) => ({ ...base, section_id: s })),
        );
    setSaving(false);
    if (res.error) return toast.error(res.error.message);
    toast.success(form.id ? "Diary entry updated" : `Posted to ${1 + form.copyTo.filter((s) => s !== form.section_id).length} section(s)`);
    setForm(null);
    qc.invalidateQueries({ queryKey: ["homework"] });
  };

  const remove = async (e: Entry) => {
    if (!confirm(`Delete "${e.title}"?`)) return;
    const { error } = await supabase.from("homework_entries").delete().eq("id", e.id);
    if (error) return toast.error(error.message);
    toast.success("Deleted");
    qc.invalidateQueries({ queryKey: ["homework"] });
  };

  const canEdit = (e: Entry) => isAdmin || e.created_by === user?.userId;
  const formCourses = courses.filter((c: any) => {
    const sec = sections.find((s) => s.id === form?.section_id);
    return !sec || !c.class_id || c.class_id === sec.class_id;
  });

  return (
    <div className="space-y-4">
      <PageHeader title="Homework & Daily Diary" description="Post the day's homework per section. Students and parents see it in the portal." />

      <div className="flex flex-wrap items-end gap-2 print:hidden">
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" aria-label="Previous day" onClick={() => setDate(addDays(date, -1))}><ChevronLeft className="h-4 w-4" /></Button>
          <Input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className="w-40" />
          <Button variant="outline" size="icon" aria-label="Next day" onClick={() => setDate(addDays(date, 1))}><ChevronRight className="h-4 w-4" /></Button>
          {date !== today && <Button variant="ghost" onClick={() => setDate(today)}>Today</Button>}
        </div>
        <Select value={sectionId} onValueChange={setSectionId}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Section" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sections</SelectItem>
            {sections.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}
          </SelectContent>
        </Select>
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={() => window.print()}><Printer className="mr-1 h-4 w-4" />Print diary</Button>
          <Button onClick={openNew}><Plus className="mr-1 h-4 w-4" />New entry</Button>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : bySection.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No diary entries for {date}. Use “New entry” to post homework.</CardContent></Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {bySection.map(([sid, rows]) => (
            <Card key={sid} className="break-inside-avoid">
              <CardContent className="space-y-3 pt-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">{secLabel.get(sid) ?? "Section"}</h3>
                  <span className="text-xs text-muted-foreground">{date}</span>
                </div>
                {groupBySubject(rows).map(([subject, items]) => (
                  <div key={subject} className="border-t pt-2">
                    <p className="text-sm font-medium">{subject}</p>
                    {items.map((e) => {
                      const s = dueState(e.due_on, today);
                      return (
                        <div key={e.id} className="group mt-1 flex items-start gap-2">
                          <div className="flex-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Badge variant="outline">{HOMEWORK_KINDS.find((k) => k.v === e.kind)?.l ?? e.kind}</Badge>
                              <span className="text-sm">{e.title}</span>
                              {s !== "none" && <Badge variant={s === "overdue" ? "destructive" : "secondary"}>{DUE_LABEL[s]} · {e.due_on}</Badge>}
                            </div>
                            {e.details && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{e.details}</p>}
                          </div>
                          {canEdit(e) && (
                            <div className="flex print:hidden">
                              <Button variant="ghost" size="icon" aria-label="Edit" onClick={() => setForm({ ...e, attachment_url: e.attachment_url ?? "", copyTo: [] })}><Pencil className="h-4 w-4" /></Button>
                              <Button variant="ghost" size="icon" aria-label="Delete" onClick={() => remove(e)}><Trash2 className="h-4 w-4" /></Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={!!form} onOpenChange={(o) => !o && setForm(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{form?.id ? "Edit diary entry" : "New diary entry"}</DialogTitle></DialogHeader>
          {form && (
            <div className="grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Section</Label>
                  <Select value={form.section_id} onValueChange={(v) => setForm({ ...form, section_id: v, course_id: null })}>
                    <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
                    <SelectContent>{sections.map((s) => <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Type</Label>
                  <Select value={form.kind} onValueChange={(v) => setForm({ ...form, kind: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{HOMEWORK_KINDS.map((k) => <SelectItem key={k.v} value={k.v}>{k.l}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>Subject</Label>
                <Select value={form.course_id ?? ""} onValueChange={(v) => {
                  const c: any = courses.find((x: any) => x.id === v);
                  setForm({ ...form, course_id: v, subject: c?.title ?? form.subject });
                }}>
                  <SelectTrigger><SelectValue placeholder="Pick a course (or type below)" /></SelectTrigger>
                  <SelectContent>{formCourses.map((c: any) => <SelectItem key={c.id} value={c.id}>{c.title}{c.code ? ` (${c.code})` : ""}</SelectItem>)}</SelectContent>
                </Select>
                <Input className="mt-2" placeholder="Subject name" value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
              </div>
              <div><Label>Title</Label><Input value={form.title} maxLength={200} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Exercise 4.2 Q1–10" /></div>
              <div><Label>Details</Label><Textarea rows={4} value={form.details} maxLength={4000} onChange={(e) => setForm({ ...form, details: e.target.value })} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Assigned on</Label><Input type="date" value={form.assigned_on} onChange={(e) => setForm({ ...form, assigned_on: e.target.value })} /></div>
                <div><Label>Due on</Label><Input type="date" value={form.due_on ?? ""} onChange={(e) => setForm({ ...form, due_on: e.target.value || null })} /></div>
              </div>
              <div><Label>Worksheet link (optional)</Label><Input value={form.attachment_url ?? ""} onChange={(e) => setForm({ ...form, attachment_url: e.target.value })} placeholder="https://…" /></div>
              {!form.id && form.section_id && (() => {
                const cls = sections.find((s) => s.id === form.section_id)?.class_id;
                const siblings = sections.filter((s) => s.class_id === cls && s.id !== form.section_id);
                if (!siblings.length) return null;
                return (
                  <div><Label>Also post to</Label>
                    <div className="mt-1 flex flex-wrap gap-3">
                      {siblings.map((s) => (
                        <label key={s.id} className="flex items-center gap-1.5 text-sm">
                          <Checkbox checked={form.copyTo.includes(s.id)} onCheckedChange={(c) => setForm({ ...form, copyTo: c ? [...form.copyTo, s.id] : form.copyTo.filter((x) => x !== s.id) })} />
                          {s.label}
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setForm(null)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
