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
import { Plus, Upload, FileText, Pencil } from "lucide-react";

export const Route = createFileRoute("/_authenticated/staff")({
  component: StaffPage,
});

type Staff = {
  id: string; staff_code: string; first_name: string; last_name: string;
  campus_id: string; designation: string | null; department: string | null;
  email: string | null; phone: string | null;
  documents: Array<{ name: string; path: string }> | null;
  profile_id: string | null;
};

function StaffPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [uploadFor, setUploadFor] = useState<Staff | null>(null);

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
            <DialogContent className="max-w-2xl">
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
                  <TableCell className="font-medium">{s.first_name} {s.last_name}</TableCell>
                  <TableCell className="text-sm">{s.designation ?? "—"} <span className="text-muted-foreground">· {s.department ?? ""}</span></TableCell>
                  <TableCell className="text-sm">{campusMap.get(s.campus_id) ?? "—"}</TableCell>
                  <TableCell className="text-sm text-muted-foreground"><div>{s.email ?? "—"}</div><div className="text-xs">{s.phone ?? ""}</div></TableCell>
                  <TableCell className="text-sm text-muted-foreground"><FileText className="mr-1 inline h-3 w-3" />{s.documents?.length ?? 0}</TableCell>
                  <TableCell className="text-right">
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
    </>
  );
}
