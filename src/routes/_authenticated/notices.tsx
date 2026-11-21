import { createFileRoute } from "@tanstack/react-router";
import { escapeDeep, escapeHtml } from "@/lib/html-escape";
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Printer, Pin, Megaphone } from "lucide-react";
import { useCurrentUser } from "@/hooks/use-current-user";
import { getActiveTenantName } from "@/lib/tenant-context";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/notices")({
  head: () => ({
    meta: [
      { title: "Notice Board & Circulars" },
      {
        name: "description",
        content:
          "Issue official circulars and notices to staff, students and campuses, with printable letterhead copies.",
      },
      { property: "og:title", content: "Notice Board & Circulars" },
      {
        property: "og:description",
        content: "Official circulars and announcements for the whole institution.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NoticesPage,
});

type Notice = {
  id: string;
  campus_id: string | null;
  reference_no: string;
  title: string;
  content: string;
  category: string;
  priority: string;
  audience: string;
  is_pinned: boolean;
  is_published: boolean;
  published_at: string;
  expires_at: string | null;
  issued_by: string;
};

const CATEGORIES = [
  { v: "general", l: "General" },
  { v: "academic", l: "Academic" },
  { v: "administrative", l: "Administrative" },
  { v: "holiday", l: "Holiday" },
  { v: "examination", l: "Examination" },
  { v: "fees", l: "Fees" },
];

const PRIORITIES = [
  { v: "normal", l: "Normal" },
  { v: "urgent", l: "Urgent" },
  { v: "critical", l: "Critical" },
];

const AUDIENCES = [
  { v: "all", l: "Everyone" },
  { v: "staff", l: "Staff & faculty" },
  { v: "students", l: "Students & parents" },
];

function label(list: { v: string; l: string }[], v: string) {
  return list.find((x) => x.v === v)?.l ?? v;
}

export function priorityClass(p: string) {
  if (p === "critical") return "border-transparent bg-destructive/10 text-destructive";
  if (p === "urgent") return "border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400";
  return "border-transparent bg-muted text-muted-foreground";
}

function NoticesPage() {
  const qc = useQueryClient();
  const { data: user } = useCurrentUser();
  const canManage = !!user?.roles.some((r) => r === "super_admin" || r === "campus_admin");

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Notice | null>(null);
  const [search, setSearch] = useState("");
  const [fCategory, setFCategory] = useState("all");
  const [fAudience, setFAudience] = useState("all");
  const [fStatus, setFStatus] = useState("all");

  const { data: campuses } = useQuery({
    queryKey: ["campuses"],
    queryFn: async () => {
      const { data, error } = await supabase.from("campuses").select("id, name").order("name");
      if (error) throw error;
      return data as { id: string; name: string }[];
    },
  });

  const { data: notices, isLoading } = useQuery({
    queryKey: ["notices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notices")
        .select("*")
        .order("is_pinned", { ascending: false })
        .order("published_at", { ascending: false });
      if (error) throw error;
      return data as Notice[];
    },
  });

  const filtered = useMemo(() => {
    const now = Date.now();
    return (notices ?? []).filter((n) => {
      if (fCategory !== "all" && n.category !== fCategory) return false;
      if (fAudience !== "all" && n.audience !== fAudience) return false;
      const expired = n.expires_at ? new Date(n.expires_at).getTime() < now : false;
      if (fStatus === "published" && (!n.is_published || expired)) return false;
      if (fStatus === "draft" && n.is_published) return false;
      if (fStatus === "expired" && !expired) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (
          !n.title.toLowerCase().includes(q) &&
          !n.content.toLowerCase().includes(q) &&
          !n.reference_no.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [notices, fCategory, fAudience, fStatus, search]);

  function nextReference() {
    const year = new Date().getFullYear();
    const prefix = `CIR/${year}/`;
    const used = (notices ?? [])
      .filter((n) => n.reference_no.startsWith(prefix))
      .map((n) => Number(n.reference_no.slice(prefix.length)) || 0);
    const next = (used.length ? Math.max(...used) : 0) + 1;
    return `${prefix}${String(next).padStart(3, "0")}`;
  }

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const campus = String(fd.get("campus_id") || "none");
    const expires = String(fd.get("expires_at") || "").trim();
    const payload = {
      reference_no: String(fd.get("reference_no") || "").trim() || nextReference(),
      title: String(fd.get("title") || "").trim(),
      content: String(fd.get("content") || "").trim(),
      category: String(fd.get("category") || "general"),
      priority: String(fd.get("priority") || "normal"),
      audience: String(fd.get("audience") || "all"),
      campus_id: campus === "none" ? null : campus,
      issued_by: String(fd.get("issued_by") || "").trim() || "Office of the Principal",
      is_pinned: fd.get("is_pinned") === "on",
      is_published: fd.get("is_published") === "on",
      expires_at: expires ? new Date(expires).toISOString() : null,
    };
    if (!payload.title) return toast.error("Please give the circular a subject.");

    const res = editing
      ? await supabase.from("notices").update(payload).eq("id", editing.id)
      : await supabase.from("notices").insert(payload);
    if (res.error) return toast.error(res.error.message);
    toast.success(editing ? "Circular updated" : "Circular issued");
    setOpen(false);
    setEditing(null);
    qc.invalidateQueries({ queryKey: ["notices"] });
  }

  async function togglePin(n: Notice) {
    const { error } = await supabase
      .from("notices")
      .update({ is_pinned: !n.is_pinned })
      .eq("id", n.id);
    if (error) return toast.error(error.message);
    qc.invalidateQueries({ queryKey: ["notices"] });
  }

  async function handleDelete(id: string) {
    if (!confirm("Remove this circular from the notice board?")) return;
    const { error } = await supabase.from("notices").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Circular removed");
    qc.invalidateQueries({ queryKey: ["notices"] });
  }

  function printNotice(raw: Notice) {
    const n = escapeDeep(raw);
    const campusName = escapeHtml(campuses?.find((c) => c.id === raw.campus_id)?.name ?? "All campuses");
    const w = window.open("", "_blank", "width=900,height=1100");
    if (!w) return;
    const body = n.content
      .split(/\n{2,}/)
      .map((p) => `<p dir="auto">${p.replace(/\n/g, "<br/>")}</p>`)
      .join("");
    w.document.write(`<!doctype html><html><head><title>${n.reference_no} - ${n.title}</title>
      <meta name="color-scheme" content="light only">
      <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Nastaliq+Urdu&display=swap">
      <style>
        :root { color-scheme: light; }
        html,body{background:#fff !important;color:#111 !important;}
        body{font-family:Georgia,serif;padding:44px;line-height:1.6;}
        .h{text-align:center;border-bottom:2px solid #111;padding-bottom:12px;margin-bottom:18px;}
        .h h1{margin:2px 0 4px;font-size:22px;letter-spacing:2px;}
        .h .sub{font-size:10px;letter-spacing:4px;text-transform:uppercase;color:#555;}
        .meta{display:flex;justify-content:space-between;font-size:12px;color:#444;margin-bottom:20px;}
        h2{font-size:16px;text-align:center;text-transform:uppercase;letter-spacing:2px;margin:24px 0 16px;}
        p{font-size:13.5px;margin:0 0 12px;}
        p:dir(rtl){font-family:"Noto Nastaliq Urdu",serif;text-align:right;line-height:2.3;font-size:15px;}
        .to{font-size:12px;color:#444;margin-bottom:14px;}
        .sig{margin-top:56px;text-align:right;font-size:12px;}
        .sig div{display:inline-block;border-top:1px solid #111;padding-top:6px;min-width:220px;text-align:center;}
        .foot{margin-top:28px;border-top:1px solid #ddd;padding-top:8px;font-size:10px;color:#666;text-align:center;}
        @media print{*{-webkit-print-color-adjust:exact !important;print-color-adjust:exact !important;}}
      </style></head><body>
      <div class="h">
        <h1>${escapeHtml(getActiveTenantName())}</h1>
        <div class="sub">${campusName}</div>
      </div>
      <div class="meta">
        <div>Ref. No: <strong>${n.reference_no}</strong></div>
        <div>Date: <strong>${new Date(raw.published_at).toLocaleDateString()}</strong></div>
      </div>
      <h2>${n.title}</h2>
      <div class="to">To: ${label(AUDIENCES, n.audience)} &nbsp;·&nbsp; Category: ${label(CATEGORIES, n.category)}${n.priority !== "normal" ? ` &nbsp;·&nbsp; ${label(PRIORITIES, n.priority).toUpperCase()}` : ""}</div>
      ${body}
      <div class="sig"><div>${n.issued_by}</div></div>
      <div class="foot">This is an officially issued circular of ${escapeHtml(getActiveTenantName())} · ${n.reference_no}</div>
      <script>window.onload=()=>window.print()</script>
      </body></html>`);
    w.document.close();
  }

  function openNew() {
    setEditing(null);
    setOpen(true);
  }

  const form = (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Circular no.</Label>
          <Input
            name="reference_no"
            defaultValue={editing?.reference_no ?? nextReference()}
            required
          />
        </div>
        <div className="space-y-2">
          <Label>Issued by</Label>
          <Input
            name="issued_by"
            defaultValue={editing?.issued_by ?? "Office of the Principal"}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Subject</Label>
        <Input name="title" defaultValue={editing?.title} required placeholder="Winter vacation schedule" />
      </div>
      <div className="space-y-2">
        <Label>Message</Label>
        <Textarea
          name="content"
          defaultValue={editing?.content}
          rows={7}
          placeholder="Write the full text of the circular…"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-2">
          <Label>Category</Label>
          <Select name="category" defaultValue={editing?.category ?? "general"}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((c) => (
                <SelectItem key={c.v} value={c.v}>
                  {c.l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Priority</Label>
          <Select name="priority" defaultValue={editing?.priority ?? "normal"}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIORITIES.map((p) => (
                <SelectItem key={p.v} value={p.v}>
                  {p.l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Audience</Label>
          <Select name="audience" defaultValue={editing?.audience ?? "all"}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {AUDIENCES.map((a) => (
                <SelectItem key={a.v} value={a.v}>
                  {a.l}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Campus</Label>
          <Select name="campus_id" defaultValue={editing?.campus_id ?? "none"}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">All campuses</SelectItem>
              {campuses?.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Valid until (optional)</Label>
          <Input
            name="expires_at"
            type="date"
            defaultValue={editing?.expires_at ? editing.expires_at.slice(0, 10) : ""}
          />
        </div>
      </div>
      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox name="is_published" defaultChecked={editing ? editing.is_published : true} />
          Publish now
        </label>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox name="is_pinned" defaultChecked={editing?.is_pinned ?? false} />
          Pin to top
        </label>
      </div>
      <DialogFooter>
        <Button type="submit">{editing ? "Save changes" : "Issue circular"}</Button>
      </DialogFooter>
    </form>
  );

  return (
    <>
      <PageHeader
        eyebrow="Communications"
        title="Notice Board & Circulars"
        description="Issue official notices to staff, students and individual campuses, and print them on institutional letterhead."
        actions={
          canManage ? (
            <Button onClick={openNew}>
              <Plus className="mr-1 h-4 w-4" /> New circular
            </Button>
          ) : null
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Input
          placeholder="Search circulars…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select value={fCategory} onValueChange={setFCategory}>
          <SelectTrigger>
            <SelectValue placeholder="Category" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {CATEGORIES.map((c) => (
              <SelectItem key={c.v} value={c.v}>
                {c.l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={fAudience} onValueChange={setFAudience}>
          <SelectTrigger>
            <SelectValue placeholder="Audience" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All audiences</SelectItem>
            {AUDIENCES.map((a) => (
              <SelectItem key={a.v} value={a.v}>
                {a.l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={fStatus} onValueChange={setFStatus}>
          <SelectTrigger>
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Any status</SelectItem>
            <SelectItem value="published">Published</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <Card className="shadow-none">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Loading circulars…
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="shadow-none">
          <CardContent className="space-y-2 py-12 text-center">
            <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-muted">
              <Megaphone className="h-5 w-5 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">
              {notices?.length
                ? "No circulars match these filters."
                : "No circulars issued yet."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((n) => {
            const expired = n.expires_at ? new Date(n.expires_at).getTime() < Date.now() : false;
            const campusName = campuses?.find((c) => c.id === n.campus_id)?.name;
            return (
              <Card key={n.id} className={cn("shadow-none", n.is_pinned && "border-primary/40")}>
                <CardContent className="space-y-3 p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        {n.is_pinned && <Pin className="h-3.5 w-3.5 text-primary" />}
                        <h3 className="font-serif text-lg font-semibold">{n.title}</h3>
                        <Badge variant="outline" className={priorityClass(n.priority)}>
                          {label(PRIORITIES, n.priority)}
                        </Badge>
                        {!n.is_published && (
                          <Badge variant="outline" className="border-dashed">
                            Draft
                          </Badge>
                        )}
                        {expired && (
                          <Badge variant="outline" className="border-dashed">
                            Expired
                          </Badge>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {n.reference_no} · {new Date(n.published_at).toLocaleDateString()} ·{" "}
                        {label(CATEGORIES, n.category)} · {label(AUDIENCES, n.audience)} ·{" "}
                        {campusName ?? "All campuses"}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" onClick={() => printNotice(n)} title="Print">
                        <Printer className="h-4 w-4" />
                      </Button>
                      {canManage && (
                        <>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => togglePin(n)}
                            title={n.is_pinned ? "Unpin" : "Pin to top"}
                          >
                            <Pin className={cn("h-4 w-4", n.is_pinned && "text-primary")} />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              setEditing(n);
                              setOpen(true);
                            }}
                            title="Edit"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleDelete(n.id)}
                            title="Remove"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                  {n.content && (
                    <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                      {n.content}
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">— {n.issued_by}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setEditing(null);
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-serif">
              {editing ? "Edit circular" : "New circular"}
            </DialogTitle>
          </DialogHeader>
          {open && form}
        </DialogContent>
      </Dialog>
    </>
  );
}
