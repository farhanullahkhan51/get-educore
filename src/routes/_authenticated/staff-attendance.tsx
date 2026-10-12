import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAllRows } from "@/lib/fetch-all";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Check, X, Plus, AlertTriangle } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useTenant } from "@/lib/tenant-context";
import { ProxyAllocator } from "@/components/timetable/proxy-dialog";
import {
  defaultStatus, leaveDays, leaveDaysInRange, summarise, unavailableStaff,
  type AttRow, type LeaveRow, type StaffAttStatus,
} from "@/lib/staff-hr";

export const Route = createFileRoute("/_authenticated/staff-attendance")({
  head: () => ({
    meta: [
      { title: "Staff Attendance & Leave" },
      { name: "description", content: "Daily staff attendance, leave applications and approvals, with automatic proxy cover." },
      { property: "og:title", content: "Staff Attendance & Leave" },
      { property: "og:description", content: "Daily staff attendance, leave approvals and proxy cover." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: StaffAttendancePage,
});

type StaffLite = { id: string; first_name: string; last_name: string; staff_code: string; campus_id: string; designation: string | null; profile_id: string | null; status: string | null };
type Leave = LeaveRow & { id: string; reason: string | null; review_note: string | null; created_at: string };
type Att = AttRow & { id: string; check_in: string | null; check_out: string | null; note: string | null };

const today = () => new Date().toISOString().slice(0, 10);
const STATUS: { v: StaffAttStatus; label: string; cls: string }[] = [
  { v: "present", label: "Present", cls: "bg-primary text-primary-foreground" },
  { v: "late", label: "Late", cls: "bg-secondary text-secondary-foreground" },
  { v: "half_day", label: "Half day", cls: "bg-secondary text-secondary-foreground" },
  { v: "absent", label: "Absent", cls: "bg-destructive text-destructive-foreground" },
  { v: "on_leave", label: "On leave", cls: "bg-muted text-foreground" },
];
const LEAVE_TYPES = ["casual", "sick", "duty", "maternity", "unpaid", "other"];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace("_", " ");

function StaffAttendancePage() {
  const qc = useQueryClient();
  const { data: user } = useCurrentUser();
  const { tenant } = useTenant();
  const isAdmin = !!user?.roles.some((r) => r === "super_admin" || r === "campus_admin");
  const [campusId, setCampusId] = useState("");
  const [date, setDate] = useState(today());
  const [month, setMonth] = useState(today().slice(0, 7));

  const { data: campuses } = useQuery({
    queryKey: ["campuses"],
    queryFn: async () => (await supabase.from("campuses").select("id, name").order("name")).data ?? [],
  });
  const ownCampus = (campuses ?? []).some((c) => c.id === user?.campusId) ? user?.campusId : null;
  const activeCampus = campusId || ownCampus || campuses?.[0]?.id || "";

  const { data: staff = [] } = useQuery({
    queryKey: ["hr.staff", activeCampus],
    enabled: !!activeCampus || !isAdmin,
    queryFn: async () => {
      let q = supabase.from("staff").select("id, first_name, last_name, staff_code, campus_id, designation, profile_id, status").order("first_name");
      if (isAdmin && activeCampus) q = q.eq("campus_id", activeCampus);
      return ((await q).data ?? []) as StaffLite[];
    },
  });
  const active = staff.filter((s) => !s.status || s.status === "active");
  const me = staff.find((s) => s.profile_id === user?.userId) ?? null;
  const nameOf = (id: string) => { const s = staff.find((x) => x.id === id); return s ? `${s.first_name} ${s.last_name}` : "—"; };

  const { data: leaves = [] } = useQuery({
    queryKey: ["hr.leaves", activeCampus, isAdmin],
    enabled: !!user,
    queryFn: async () => (await fetchAllRows<Leave>((f, t) => {
      let q = supabase.from("staff_leaves").select("id, staff_id, start_date, end_date, status, leave_type, reason, review_note, created_at").order("created_at", { ascending: false });
      if (isAdmin && activeCampus) q = q.eq("campus_id", activeCampus);
      return q.range(f, t) as any;
    })) as Leave[],
  });

  const { data: dayAtt = [] } = useQuery({
    queryKey: ["hr.att.day", activeCampus, date],
    enabled: isAdmin && !!activeCampus,
    queryFn: async () => ((await supabase.from("staff_attendance").select("id, staff_id, date, status, check_in, check_out, note").eq("campus_id", activeCampus).eq("date", date)).data ?? []) as Att[],
  });

  const monthFrom = `${month}-01`;
  const monthTo = new Date(Date.UTC(+month.slice(0, 4), +month.slice(5, 7), 0)).toISOString().slice(0, 10);
  const { data: monthAtt = [] } = useQuery({
    queryKey: ["hr.att.month", activeCampus, month, isAdmin],
    enabled: !!user,
    queryFn: async () => (await fetchAllRows<Att>((f, t) => {
      let q = supabase.from("staff_attendance").select("id, staff_id, date, status, check_in, check_out, note").gte("date", monthFrom).lte("date", monthTo);
      if (isAdmin && activeCampus) q = q.eq("campus_id", activeCampus);
      return q.range(f, t) as any;
    })) as Att[],
  });

  // Draft sheet for the selected day
  const [draft, setDraft] = useState<Record<string, { status: StaffAttStatus; check_in: string; note: string }>>({});
  useEffect(() => {
    const m: typeof draft = {};
    for (const s of active) {
      const row = dayAtt.find((a) => a.staff_id === s.id);
      m[s.id] = { status: row?.status ?? defaultStatus(s.id, date, leaves), check_in: row?.check_in?.slice(0, 5) ?? "", note: row?.note ?? "" };
    }
    setDraft(m);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dayAtt, staff, leaves, date]);
  const [saving, setSaving] = useState(false);

  async function saveSheet() {
    setSaving(true);
    const rows = Object.entries(draft).map(([staff_id, d]) => ({
      staff_id, date, status: d.status, check_in: d.check_in || null, note: d.note || null,
      marked_by: user?.userId ?? null, tenant_id: tenant?.id ?? "", campus_id: activeCampus,
    }));
    const { error } = await supabase.from("staff_attendance").upsert(rows, { onConflict: "staff_id,date" });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(`Attendance saved for ${rows.length} staff.`);
    qc.invalidateQueries({ queryKey: ["hr.att.day"] });
    qc.invalidateQueries({ queryKey: ["hr.att.month"] });
  }

  const savedUnavailable = useMemo(() => unavailableStaff(date, dayAtt, leaves), [date, dayAtt, leaves]);
  const counts = STATUS.map((s) => ({ ...s, n: Object.values(draft).filter((d) => d.status === s.v).length }));

  // Leave form
  const [applyOpen, setApplyOpen] = useState(false);
  const [lf, setLf] = useState({ staff_id: "", leave_type: "casual", start_date: today(), end_date: today(), reason: "" });
  async function submitLeave() {
    const staff_id = isAdmin ? lf.staff_id : me?.id;
    if (!staff_id) return toast.error(isAdmin ? "Choose the staff member." : "Your login is not linked to a staff record.");
    if (lf.end_date < lf.start_date) return toast.error("End date is before start date.");
    const overlap = leaves.some((l) => l.staff_id === staff_id && ["pending", "approved"].includes(l.status) && l.start_date <= lf.end_date && l.end_date >= lf.start_date);
    if (overlap) return toast.error("This person already has a leave on these dates.");
    const { error } = await supabase.from("staff_leaves").insert({
      staff_id, leave_type: lf.leave_type, start_date: lf.start_date, end_date: lf.end_date, reason: lf.reason || null,
      tenant_id: tenant?.id ?? "", campus_id: activeCampus || me?.campus_id || "",
    });
    if (error) return toast.error(error.message);
    toast.success("Leave application submitted.");
    setApplyOpen(false);
    qc.invalidateQueries({ queryKey: ["hr.leaves"] });
  }
  async function review(l: Leave, status: "approved" | "rejected" | "cancelled") {
    const patch = status === "cancelled" ? { status } : { status, reviewed_by: user?.userId, reviewed_at: new Date().toISOString() };
    const { error } = await supabase.from("staff_leaves").update(patch).eq("id", l.id);
    if (error) return toast.error(error.message);
    toast.success(`Leave ${status}.`);
    qc.invalidateQueries({ queryKey: ["hr.leaves"] });
  }

  const pending = leaves.filter((l) => l.status === "pending");
  const [leaveFilter, setLeaveFilter] = useState("pending");
  const shownLeaves = leaves.filter((l) => leaveFilter === "all" || l.status === leaveFilter);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff Attendance & Leave"
        description="Mark daily staff attendance, approve leave, and arrange proxy cover for absent teachers."
        actions={
          <div className="flex gap-2 flex-wrap">
            <Button onClick={() => { setLf({ staff_id: "", leave_type: "casual", start_date: today(), end_date: today(), reason: "" }); setApplyOpen(true); }}>
              <Plus className="h-4 w-4 mr-1" />{isAdmin ? "Record leave" : "Apply for leave"}
            </Button>
            {isAdmin && (campuses?.length ?? 0) > 1 && (
              <Select value={activeCampus} onValueChange={setCampusId}>
                <SelectTrigger className="w-48"><SelectValue placeholder="Campus" /></SelectTrigger>
                <SelectContent>{campuses!.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            )}
          </div>
        }
      />

      <Tabs defaultValue={isAdmin ? "daily" : "leaves"}>
        <TabsList>
          {isAdmin && <TabsTrigger value="daily">Daily sheet</TabsTrigger>}
          <TabsTrigger value="leaves">Leave applications{isAdmin && pending.length > 0 ? ` (${pending.length})` : ""}</TabsTrigger>
          <TabsTrigger value="register">Monthly register</TabsTrigger>
        </TabsList>

        {isAdmin && (
          <TabsContent value="daily" className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div><Label className="text-xs">Date</Label><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-44" /></div>
              <Button variant="outline" onClick={() => setDraft(Object.fromEntries(Object.entries(draft).map(([k, d]) => [k, { ...d, status: d.status === "on_leave" ? d.status : "present" }])))}>Mark all present</Button>
              <Button onClick={saveSheet} disabled={saving || !active.length}>{saving ? "Saving…" : "Save attendance"}</Button>
              <div className="flex flex-wrap gap-2 text-xs ml-auto">
                {counts.map((c) => <Badge key={c.v} variant="outline">{c.label}: {c.n}</Badge>)}
              </div>
            </div>

            {savedUnavailable.size > 0 && (
              <Card className="border-destructive/40">
                <CardContent className="py-4 space-y-3">
                  <div className="flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4 text-destructive" />{savedUnavailable.size} teacher(s) unavailable on {date} — arrange proxy cover</div>
                  <div className="flex flex-wrap gap-2">
                    {[...savedUnavailable].map(([id, why]) => (
                      <div key={id} className="flex items-center gap-2 rounded-md border px-2 py-1 text-sm">
                        <span>{nameOf(id)}</span><Badge variant="secondary">{why === "absent" ? "Absent" : "On leave"}</Badge>
                        <ProxyAllocator key={`${id}-${date}`} campusId={activeCampus} tenantId={tenant?.id ?? null} canEdit presetAbsent={id} presetDate={date} label="Find cover" />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card><CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader><TableRow><TableHead>Staff</TableHead><TableHead>Status</TableHead><TableHead>Check-in</TableHead><TableHead>Note</TableHead></TableRow></TableHeader>
                <TableBody>
                  {active.length === 0 && <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">No active staff on this campus.</TableCell></TableRow>}
                  {active.map((s) => {
                    const d = draft[s.id]; if (!d) return null;
                    const set = (p: Partial<typeof d>) => setDraft({ ...draft, [s.id]: { ...d, ...p } });
                    return (
                      <TableRow key={s.id}>
                        <TableCell><div className="font-medium">{s.first_name} {s.last_name}</div><div className="text-xs text-muted-foreground">{s.staff_code}{s.designation ? ` · ${s.designation}` : ""}</div></TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {STATUS.map((o) => (
                              <button key={o.v} type="button" onClick={() => set({ status: o.v })}
                                className={`rounded px-2 py-1 text-xs border transition-colors ${d.status === o.v ? o.cls : "bg-background text-muted-foreground hover:bg-muted"}`}>{o.label}</button>
                            ))}
                          </div>
                        </TableCell>
                        <TableCell><Input type="time" value={d.check_in} onChange={(e) => set({ check_in: e.target.value })} className="w-28" disabled={d.status === "absent" || d.status === "on_leave"} /></TableCell>
                        <TableCell><Input value={d.note} onChange={(e) => set({ note: e.target.value })} placeholder="Optional" className="min-w-40" /></TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent></Card>
          </TabsContent>
        )}

        <TabsContent value="leaves" className="space-y-4">
          <Select value={leaveFilter} onValueChange={setLeaveFilter}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>{["pending", "approved", "rejected", "cancelled", "all"].map((s) => <SelectItem key={s} value={s}>{cap(s)}</SelectItem>)}</SelectContent>
          </Select>
          <Card><CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Staff</TableHead><TableHead>Type</TableHead><TableHead>Dates</TableHead><TableHead>Days</TableHead><TableHead>Reason</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
              <TableBody>
                {shownLeaves.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No leave applications.</TableCell></TableRow>}
                {shownLeaves.map((l) => (
                  <TableRow key={l.id}>
                    <TableCell className="font-medium">{nameOf(l.staff_id)}</TableCell>
                    <TableCell>{cap(l.leave_type)}</TableCell>
                    <TableCell className="whitespace-nowrap">{l.start_date}{l.end_date !== l.start_date ? ` → ${l.end_date}` : ""}</TableCell>
                    <TableCell>{leaveDays(l.start_date, l.end_date)}</TableCell>
                    <TableCell className="max-w-64 truncate">{l.reason ?? "—"}</TableCell>
                    <TableCell><Badge variant={l.status === "approved" ? "default" : l.status === "rejected" ? "destructive" : "secondary"}>{cap(l.status)}</Badge></TableCell>
                    <TableCell className="text-right whitespace-nowrap">
                      {isAdmin && l.status === "pending" && <>
                        <Button size="sm" variant="ghost" onClick={() => review(l, "approved")}><Check className="h-4 w-4 mr-1" />Approve</Button>
                        <Button size="sm" variant="ghost" onClick={() => review(l, "rejected")}><X className="h-4 w-4 mr-1" />Reject</Button>
                      </>}
                      {isAdmin && l.status === "approved" && <Button size="sm" variant="ghost" onClick={() => review(l, "cancelled")}>Cancel</Button>}
                      {!isAdmin && l.status === "pending" && <Button size="sm" variant="ghost" onClick={() => review(l, "cancelled")}>Withdraw</Button>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent></Card>
        </TabsContent>

        <TabsContent value="register" className="space-y-4">
          <div><Label className="text-xs">Month</Label><Input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="w-44" /></div>
          <Card><CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Staff</TableHead><TableHead>Present</TableHead><TableHead>Late</TableHead><TableHead>Half day</TableHead><TableHead>Absent</TableHead><TableHead>On leave</TableHead><TableHead>Attendance</TableHead><TableHead>Approved leave</TableHead></TableRow></TableHeader>
              <TableBody>
                {(isAdmin ? active : me ? [me] : []).map((s) => {
                  const sm = summarise(monthAtt.filter((a) => a.staff_id === s.id));
                  const ld = leaveDaysInRange(leaves.filter((l) => l.staff_id === s.id), monthFrom, monthTo);
                  return (
                    <TableRow key={s.id}>
                      <TableCell className="font-medium">{s.first_name} {s.last_name}</TableCell>
                      <TableCell>{sm.present}</TableCell><TableCell>{sm.late}</TableCell><TableCell>{sm.half_day}</TableCell>
                      <TableCell className={sm.absent ? "text-destructive font-medium" : ""}>{sm.absent}</TableCell>
                      <TableCell>{sm.on_leave}</TableCell>
                      <TableCell>{sm.attendancePct === null ? "—" : `${sm.attendancePct}%`}</TableCell>
                      <TableCell className="text-xs">{Object.entries(ld).map(([k, v]) => `${cap(k)} ${v}`).join(", ") || "—"}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent></Card>
          <p className="text-xs text-muted-foreground">Late counts as present; half day counts as half; leave days are not counted against attendance. Unpaid leave days are listed for payroll.</p>
        </TabsContent>
      </Tabs>

      <Dialog open={applyOpen} onOpenChange={setApplyOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{isAdmin ? "Record leave" : "Apply for leave"}</DialogTitle></DialogHeader>
          <div className="grid gap-3">
            {isAdmin && (
              <div><Label>Staff member</Label>
                <Select value={lf.staff_id} onValueChange={(v) => setLf({ ...lf, staff_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Choose" /></SelectTrigger>
                  <SelectContent>{active.map((s) => <SelectItem key={s.id} value={s.id}>{s.first_name} {s.last_name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div><Label>Type</Label>
              <Select value={lf.leave_type} onValueChange={(v) => setLf({ ...lf, leave_type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{LEAVE_TYPES.map((t) => <SelectItem key={t} value={t}>{cap(t)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>From</Label><Input type="date" value={lf.start_date} onChange={(e) => setLf({ ...lf, start_date: e.target.value })} /></div>
              <div><Label>To</Label><Input type="date" value={lf.end_date} onChange={(e) => setLf({ ...lf, end_date: e.target.value })} /></div>
            </div>
            <div><Label>Reason</Label><Textarea value={lf.reason} onChange={(e) => setLf({ ...lf, reason: e.target.value })} /></div>
            {isAdmin && <p className="text-xs text-muted-foreground">Recorded leave starts as pending — approve it from the list.</p>}
          </div>
          <DialogFooter><Button onClick={submitLeave}>Submit</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
