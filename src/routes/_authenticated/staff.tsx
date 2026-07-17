import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Upload, FileText, Pencil, Wallet, Trash2 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/staff")({
  component: StaffPage,
});

type Staff = {
  id: string; staff_code: string; first_name: string; last_name: string;
  campus_id: string; designation: string | null; department: string | null;
  email: string | null; phone: string | null;
  qualification: string | null; address: string | null;
  documents: Array<{ name: string; path: string }> | null;
  profile_id: string | null;
};

type PayrollEntry = {
  id: string;
  staff_id: string;
  campus_id: string;
  entry_type: "salary" | "bonus" | "increment" | "deduction";
  amount: number;
  effective_date: string;
  note: string | null;
  created_at: string;
};

function StaffPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Staff | null>(null);
  const [uploadFor, setUploadFor] = useState<Staff | null>(null);
  const [payrollFor, setPayrollFor] = useState<Staff | null>(null);

  const { data: campuses } = useQuery({
    queryKey: ["campuses"],
    queryFn: async () => (await supabase.from("campuses").select("id, name").order("name")).data ?? [],
  });
  const { data: staff, isLoading } = useQuery({
    queryKey: ["staff"],
    queryFn: async () => (await supabase.from("staff").select("*").order("created_at", { ascending: false })).data as Staff[] | null,
  });
  const campusMap = new Map(campuses?.map((c) => [c.id, c.name]));

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const code = "STF-" + Date.now().toString(36).toUpperCase();
    const { error } = await supabase.from("staff").insert({
      staff_code: code,
      first_name: String(fd.get("first_name")),
      last_name: String(fd.get("last_name")),
      campus_id: String(fd.get("campus_id")),
      designation: String(fd.get("designation") || "") || null,
      department: String(fd.get("department") || "") || null,
      email: String(fd.get("email") || "") || null,
      phone: String(fd.get("phone") || "") || null,
      qualification: String(fd.get("qualification") || "") || null,
      address: String(fd.get("address") || "") || null,
    });
    if (error) return toast.error(error.message);
    toast.success(`Staff ${code} added`);
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["staff"] });
  }

  async function handleUpdate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!editing) return;
    const fd = new FormData(e.currentTarget);
    const { error } = await supabase.from("staff").update({
      first_name: String(fd.get("first_name")),
      last_name: String(fd.get("last_name")),
      campus_id: String(fd.get("campus_id")),
      designation: String(fd.get("designation") || "") || null,
      department: String(fd.get("department") || "") || null,
      email: String(fd.get("email") || "") || null,
      phone: String(fd.get("phone") || "") || null,
      qualification: String(fd.get("qualification") || "") || null,
      address: String(fd.get("address") || "") || null,
    }).eq("id", editing.id);
    if (error) return toast.error(error.message);
    toast.success("Staff updated");
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["staff"] });
  }


  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    if (!uploadFor || !e.target.files?.[0]) return;
    const file = e.target.files[0];
    const path = `${uploadFor.profile_id ?? uploadFor.id}/${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from("staff-docs").upload(path, file);
    if (upErr) return toast.error(upErr.message);
    const newDocs = [...(uploadFor.documents ?? []), { name: file.name, path }];
    const { error } = await supabase.from("staff").update({ documents: newDocs }).eq("id", uploadFor.id);
    if (error) return toast.error(error.message);
    toast.success("Document uploaded");
    setUploadFor(null);
    qc.invalidateQueries({ queryKey: ["staff"] });
  }

  return (
    <>
      <PageHeader
        eyebrow="Personnel"
        title="Staff"
        description="Manage teaching and administrative staff. Portal logins are granted via Users & Roles."
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild><Button><Plus className="mr-1 h-4 w-4" /> New staff</Button></DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader><DialogTitle className="font-serif">Add staff member</DialogTitle></DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label>First name</Label><Input name="first_name" required /></div>
                  <div className="space-y-2"><Label>Last name</Label><Input name="last_name" required /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label>Designation</Label><Input name="designation" placeholder="Teacher" /></div>
                  <div className="space-y-2"><Label>Department</Label><Input name="department" placeholder="Sciences" /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label>Email</Label><Input name="email" type="email" /></div>
                  <div className="space-y-2"><Label>Phone</Label><Input name="phone" /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2"><Label>Qualification</Label><Input name="qualification" /></div>
                  <div className="space-y-2">
                    <Label>Campus</Label>
                    <Select name="campus_id" required>
                      <SelectTrigger><SelectValue placeholder="Campus" /></SelectTrigger>
                      <SelectContent>{campuses?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2"><Label>Address</Label><Input name="address" /></div>
                <DialogFooter><Button type="submit">Add staff</Button></DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        }
      />

      <Card className="shadow-none">
        <CardContent className="p-0">
          <Table>
            <TableHeader><TableRow>
              <TableHead>Staff ID</TableHead><TableHead>Name</TableHead>
              <TableHead>Designation</TableHead><TableHead>Campus</TableHead>
              <TableHead>Contact</TableHead><TableHead>Docs</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow></TableHeader>
            <TableBody>
              {isLoading && <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">Loading…</TableCell></TableRow>}
              {staff?.length === 0 && <TableRow><TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">No staff yet.</TableCell></TableRow>}
              {staff?.map((s) => (
                <TableRow key={s.id}>
                  <TableCell><code className="rounded bg-muted px-1.5 py-0.5 text-xs">{s.staff_code}</code></TableCell>
                  <TableCell>
                    <button
                      onClick={() => setPayrollFor(s)}
                      className="font-medium text-primary hover:underline text-left"
                    >
                      {s.first_name} {s.last_name}
                    </button>
                  </TableCell>
                  <TableCell className="text-sm">{s.designation ?? "—"} <span className="text-muted-foreground">· {s.department ?? ""}</span></TableCell>
                  <TableCell className="text-sm">{campusMap.get(s.campus_id) ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground"><div>{s.email ?? "—"}</div><div className="text-xs">{s.phone ?? ""}</div></TableCell>
                  <TableCell className="text-sm text-muted-foreground"><FileText className="mr-1 inline h-3 w-3" />{s.documents?.length ?? 0}</TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" variant="ghost" onClick={() => setPayrollFor(s)}><Wallet className="mr-1 h-3 w-3" /> Payroll</Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(s)}><Pencil className="mr-1 h-3 w-3" /> Edit</Button>
                    <Button size="sm" variant="ghost" onClick={() => setUploadFor(s)}><Upload className="mr-1 h-3 w-3" /> Upload</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Dialog open={!!uploadFor} onOpenChange={(o) => !o && setUploadFor(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-serif">Upload document — {uploadFor?.first_name} {uploadFor?.last_name}</DialogTitle></DialogHeader>
          <Input type="file" onChange={handleUpload} />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="font-serif">Edit staff — {editing?.staff_code}</DialogTitle></DialogHeader>
          {editing && (
            <form onSubmit={handleUpdate} className="space-y-4" key={editing.id}>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>First name</Label><Input name="first_name" defaultValue={editing.first_name} required /></div>
                <div className="space-y-2"><Label>Last name</Label><Input name="last_name" defaultValue={editing.last_name} required /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Designation</Label><Input name="designation" defaultValue={editing.designation ?? ""} /></div>
                <div className="space-y-2"><Label>Department</Label><Input name="department" defaultValue={editing.department ?? ""} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Email</Label><Input name="email" type="email" defaultValue={editing.email ?? ""} /></div>
                <div className="space-y-2"><Label>Phone</Label><Input name="phone" defaultValue={editing.phone ?? ""} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2"><Label>Qualification</Label><Input name="qualification" defaultValue={editing.qualification ?? ""} /></div>
                <div className="space-y-2">
                  <Label>Campus</Label>
                  <Select name="campus_id" defaultValue={editing.campus_id} required>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{campuses?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2"><Label>Address</Label><Input name="address" defaultValue={editing.address ?? ""} /></div>
              <DialogFooter><Button type="submit">Save changes</Button></DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <PayrollDialog staff={payrollFor} onOpenChange={(o) => !o && setPayrollFor(null)} />
    </>
  );
}

function PayrollDialog({ staff, onOpenChange }: { staff: Staff | null; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const { data: entries, isLoading } = useQuery({
    queryKey: ["staff_payroll", staff?.id],
    enabled: !!staff,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff_payroll")
        .select("*")
        .eq("staff_id", staff!.id)
        .order("effective_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as PayrollEntry[];
    },
  });

  const summary = (() => {
    if (!entries) return { salary: 0, bonus: 0, increment: 0, deduction: 0, net: 0 };
    let salary = 0, bonus = 0, increment = 0, deduction = 0;
    for (const e of entries) {
      const a = Number(e.amount);
      if (e.entry_type === "salary") salary = a; // latest salary (entries ordered desc, keep first seen)
    }
    // Recompute latest salary explicitly
    const latestSalary = entries.find((e) => e.entry_type === "salary");
    salary = latestSalary ? Number(latestSalary.amount) : 0;
    for (const e of entries) {
      const a = Number(e.amount);
      if (e.entry_type === "bonus") bonus += a;
      else if (e.entry_type === "increment") increment += a;
      else if (e.entry_type === "deduction") deduction += a;
    }
    return { salary, bonus, increment, deduction, net: salary + increment + bonus - deduction };
  })();

  async function addEntry(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!staff) return;
    const fd = new FormData(e.currentTarget);
    const { error } = await supabase.from("staff_payroll").insert({
      staff_id: staff.id,
      campus_id: staff.campus_id,
      entry_type: String(fd.get("entry_type")) as PayrollEntry["entry_type"],
      amount: Number(fd.get("amount")),
      effective_date: String(fd.get("effective_date")),
      note: String(fd.get("note") || "") || null,
    });
    if (error) return toast.error(error.message);
    toast.success("Payroll entry added");
    (e.currentTarget as HTMLFormElement).reset();
    qc.invalidateQueries({ queryKey: ["staff_payroll", staff.id] });
  }

  async function deleteEntry(id: string) {
    if (!staff) return;
    const { error } = await supabase.from("staff_payroll").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Entry removed");
    qc.invalidateQueries({ queryKey: ["staff_payroll", staff.id] });
  }

  return (
    <Dialog open={!!staff} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-serif">
            Payroll — {staff?.first_name} {staff?.last_name}
          </DialogTitle>
        </DialogHeader>

        {staff && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3 rounded-sm border p-3 text-sm md:grid-cols-4">
              <StatBox label="Staff ID" value={staff.staff_code} />
              <StatBox label="Designation" value={staff.designation ?? "—"} />
              <StatBox label="Department" value={staff.department ?? "—"} />
              <StatBox label="Contact" value={staff.email ?? staff.phone ?? "—"} />
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <StatBox label="Current salary" value={fmt(summary.salary)} />
              <StatBox label="Increments" value={fmt(summary.increment)} />
              <StatBox label="Bonuses" value={fmt(summary.bonus)} />
              <StatBox label="Deductions" value={fmt(summary.deduction)} />
              <StatBox label="Net (est.)" value={fmt(summary.net)} highlight />
            </div>

            <form onSubmit={addEntry} className="grid grid-cols-1 gap-3 rounded-sm border p-3 md:grid-cols-5">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select name="entry_type" defaultValue="salary" required>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="salary">Salary</SelectItem>
                    <SelectItem value="bonus">Bonus</SelectItem>
                    <SelectItem value="increment">Increment</SelectItem>
                    <SelectItem value="deduction">Deduction</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Amount</Label>
                <Input name="amount" type="number" step="0.01" required />
              </div>
              <div className="space-y-2">
                <Label>Effective date</Label>
                <Input name="effective_date" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label>Note</Label>
                <Input name="note" placeholder="Reason / reference" />
              </div>
              <div className="md:col-span-5">
                <Button type="submit" size="sm"><Plus className="mr-1 h-3 w-3" /> Add entry</Button>
              </div>
            </form>

            <div className="rounded-sm border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Note</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading && <TableRow><TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">Loading…</TableCell></TableRow>}
                  {!isLoading && (entries?.length ?? 0) === 0 && <TableRow><TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">No payroll entries yet.</TableCell></TableRow>}
                  {entries?.map((e) => (
                    <TableRow key={e.id}>
                      <TableCell className="text-sm">{e.effective_date}</TableCell>
                      <TableCell className="text-sm capitalize">{e.entry_type}</TableCell>
                      <TableCell className="text-right font-medium">{fmt(Number(e.amount))}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{e.note ?? "—"}</TableCell>
                      <TableCell>
                        <Button size="icon" variant="ghost" onClick={() => deleteEntry(e.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function StatBox({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-sm border p-2 ${highlight ? "bg-primary/5 border-primary/40" : ""}`}>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-sm font-semibold">{value}</div>
    </div>
  );
}

function fmt(n: number) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(n);
}
