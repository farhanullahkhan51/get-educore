import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { GraduationCap, CheckCircle2 } from "lucide-react";
import { z } from "zod";
import { useTenant } from "@/lib/tenant-context";

export const Route = createFileRoute("/inquire")({
  head: () => ({
    meta: [
      { title: "Admissions Inquiry — EduCore" },
      { name: "description", content: "Register your interest in enrolling at one of our campuses. Our admissions team will be in touch shortly." },
      { property: "og:title", content: "Admissions Inquiry — EduCore" },
      { property: "og:description", content: "Register your interest in enrolling at one of our campuses." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: InquirePage,
});

const inquirySchema = z.object({
  student_name: z.string().trim().min(2, "Please enter the student's full name").max(120),
  student_dob: z.string().optional().nullable(),
  student_gender: z.string().optional().nullable(),
  previous_school: z.string().trim().max(160).optional().nullable(),
  grade_applying_for: z.string().trim().max(60).optional().nullable(),
  guardian_name: z.string().trim().min(2, "Guardian name is required").max(120),
  guardian_relation: z.string().trim().max(40).optional().nullable(),
  guardian_phone: z.string().trim().min(6, "A reachable phone number is required").max(30),
  guardian_email: z.string().trim().email("Enter a valid email").max(160).optional().or(z.literal("")),
  address: z.string().trim().max(400).optional().nullable(),
  campus_id: z.string().uuid().optional().nullable(),
  program_id: z.string().uuid().optional().nullable(),
  academic_system: z.enum(["board", "cambridge"]).optional().nullable(),
  notes: z.string().trim().max(1000).optional().nullable(),
});

function InquirePage() {
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [campusId, setCampusId] = useState<string>("");

  const { data: campuses } = useQuery({
    queryKey: ["public-campuses"],
    queryFn: async () => (await supabase.from("campuses").select("id, name, academic_system").order("name")).data ?? [],
  });

  const { data: programs } = useQuery({
    queryKey: ["public-programs", campusId],
    enabled: !!campusId,
    queryFn: async () => (await supabase.from("programs").select("id, name, academic_system").eq("campus_id", campusId).order("name")).data ?? [],
  });

  const selectedCampus = campuses?.find((c) => c.id === campusId);
  const showSystemToggle = selectedCampus?.academic_system === "both";

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const raw = {
      student_name: String(fd.get("student_name") ?? ""),
      student_dob: (fd.get("student_dob") as string) || null,
      student_gender: (fd.get("student_gender") as string) || null,
      previous_school: (fd.get("previous_school") as string) || null,
      grade_applying_for: (fd.get("grade_applying_for") as string) || null,
      guardian_name: String(fd.get("guardian_name") ?? ""),
      guardian_relation: (fd.get("guardian_relation") as string) || null,
      guardian_phone: String(fd.get("guardian_phone") ?? ""),
      guardian_email: (fd.get("guardian_email") as string) || "",
      address: (fd.get("address") as string) || null,
      campus_id: campusId || null,
      program_id: (fd.get("program_id") as string) || null,
      academic_system: (fd.get("academic_system") as "board" | "cambridge") || null,
      notes: (fd.get("notes") as string) || null,
    };

    const parsed = inquirySchema.safeParse(raw);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Please review your entries");
      return;
    }

    setSubmitting(true);
    // Default academic_system from campus when not both-type
    let academic_system = parsed.data.academic_system;
    if (!academic_system && selectedCampus && selectedCampus.academic_system !== "both") {
      academic_system = selectedCampus.academic_system as "board" | "cambridge";
    }

    const { error } = await supabase.from("inquiries").insert({
      ...parsed.data,
      guardian_email: parsed.data.guardian_email || null,
      academic_system: academic_system ?? null,
      source: "website",
      status: "new",
    });
    setSubmitting(false);

    if (error) {
      toast.error(error.message);
      return;
    }
    setSubmitted(true);
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-background">
        <PublicHeader />
        <main className="mx-auto max-w-2xl px-6 py-24 text-center">
          <CheckCircle2 className="mx-auto h-14 w-14 text-primary" />
          <h1 className="mt-6 font-serif text-4xl font-semibold tracking-tight">Inquiry received</h1>
          <p className="mt-4 text-muted-foreground">
            Thank you. A member of our admissions team will reach out within one working day at the phone number you provided.
          </p>
          <div className="mt-8">
            <Link to="/"><Button variant="outline">Return home</Button></Link>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />
      <main className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Admissions</p>
        <h1 className="mt-3 font-serif text-4xl font-semibold tracking-tight">Register an inquiry</h1>
        <p className="mt-3 max-w-2xl text-muted-foreground">
          Tell us about the prospective student. Fields marked with * are required; the rest help us match the right program.
        </p>

        <Card className="mt-8 shadow-none">
          <CardContent className="p-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              <Section title="Student">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Full name *"><Input name="student_name" required maxLength={120} /></Field>
                  <Field label="Grade applying for">
                    <Input name="grade_applying_for" placeholder="e.g. Class 9, O-Level Y1" maxLength={60} />
                  </Field>
                  <Field label="Date of birth"><Input name="student_dob" type="date" /></Field>
                  <Field label="Gender">
                    <Select name="student_gender">
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="male">Male</SelectItem>
                        <SelectItem value="female">Female</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Previous school" className="md:col-span-2">
                    <Input name="previous_school" maxLength={160} />
                  </Field>
                </div>
              </Section>

              <Section title="Guardian">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Guardian name *"><Input name="guardian_name" required maxLength={120} /></Field>
                  <Field label="Relation">
                    <Input name="guardian_relation" placeholder="Father / Mother / Guardian" maxLength={40} />
                  </Field>
                  <Field label="Phone *"><Input name="guardian_phone" required maxLength={30} inputMode="tel" /></Field>
                  <Field label="Email"><Input name="guardian_email" type="email" maxLength={160} /></Field>
                  <Field label="Address" className="md:col-span-2">
                    <Textarea name="address" rows={2} maxLength={400} />
                  </Field>
                </div>
              </Section>

              <Section title="Preferred program">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Campus">
                    <Select value={campusId} onValueChange={setCampusId}>
                      <SelectTrigger><SelectValue placeholder="Select campus" /></SelectTrigger>
                      <SelectContent>
                        {campuses?.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Program">
                    <Select name="program_id" disabled={!campusId}>
                      <SelectTrigger><SelectValue placeholder={campusId ? "Select program" : "Choose campus first"} /></SelectTrigger>
                      <SelectContent>
                        {programs?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  {showSystemToggle && (
                    <Field label="Academic system" className="md:col-span-2">
                      <Select name="academic_system">
                        <SelectTrigger><SelectValue placeholder="Board or Cambridge" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="board">Board (BISE)</SelectItem>
                          <SelectItem value="cambridge">Cambridge (O/A-Level)</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  )}
                  <Field label="Anything else we should know?" className="md:col-span-2">
                    <Textarea name="notes" rows={3} maxLength={1000} placeholder="Special requirements, questions, preferred visit time…" />
                  </Field>
                </div>
              </Section>

              <div className="flex items-center justify-between border-t border-border pt-5">
                <p className="text-xs text-muted-foreground">Your details are kept private and used only by our admissions office.</p>
                <Button type="submit" size="lg" disabled={submitting}>
                  {submitting ? "Sending…" : "Submit inquiry"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}

function PublicHeader() {
  return (
    <header className="hairline">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <Link to="/" className="flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-sm bg-primary text-primary-foreground">
            <GraduationCap className="h-4 w-4" />
          </div>
          <span className="font-serif text-lg font-semibold tracking-tight">EduCore</span>
        </Link>
        <Link to="/auth"><Button variant="outline" size="sm">Staff sign in</Button></Link>
      </div>
    </header>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-3 font-serif text-lg font-semibold">{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <div className={"space-y-2 " + (className ?? "")}>
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
