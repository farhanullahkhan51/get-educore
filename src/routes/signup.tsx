import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { checkWorkspaceSlug, provisionInstitution } from "@/lib/signup.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { CheckCircle2, GraduationCap, Loader2 } from "lucide-react";
import { getPublicSite } from "@/lib/public-site.functions";

export const Route = createFileRoute("/signup")({
  validateSearch: (search: Record<string, unknown>) => ({
    plan: typeof search["plan"] === "string" ? (search["plan"] as string) : undefined,
  }),
  loader: () => getPublicSite(),
  head: ({ loaderData }) => {
    const site = loaderData ?? { name: "EduCore", origin: "https://get-educore.lovable.app" };
    const title = `Start your 20-day free trial — ${site.name}`;
    const description = `Create your institution's ${site.name} workspace in minutes. 20-day free trial, no card required, Board and Cambridge ready.`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: `${site.origin}/signup` },
        { name: "twitter:card", content: "summary" },
      ],
      links: [{ rel: "canonical", href: `${site.origin}/signup` }],
    };
  },
  component: SignupPage,
});

type PlanOption = { id: string; name: string; description: string | null };

const slugify = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 31);

function SignupPage() {
  const navigate = useNavigate();
  const { plan: planFromUrl } = Route.useSearch();
  const checkSlug = useServerFn(checkWorkspaceSlug);
  const provision = useServerFn(provisionInstitution);

  const [step, setStep] = useState<1 | 2>(1);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    institution_name: "",
    contact_name: "",
    email: "",
    phone: "",
    city: "",
    academic_system: "both" as "board" | "cambridge" | "both",
    plan_tier_id: planFromUrl ?? "",
    slug: "",
    password: "",
  });
  const [slugTouched, setSlugTouched] = useState(false);
  const [slugState, setSlugState] = useState<{ checking: boolean; available: boolean | null; reason: string | null }>({
    checking: false,
    available: null,
    reason: null,
  });

  const { data: plans } = useQuery({
    queryKey: ["public.plans.options"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plan_tiers")
        .select("id, name, description")
        .eq("is_public", true)
        .order("sort_order");
      if (error) throw error;
      return data as PlanOption[];
    },
  });

  useEffect(() => {
    if (!form.plan_tier_id && plans?.length) {
      setForm((f) => ({ ...f, plan_tier_id: planFromUrl ?? plans[0]!.id }));
    }
  }, [plans, planFromUrl, form.plan_tier_id]);

  const slug = slugTouched ? form.slug : slugify(form.institution_name);

  useEffect(() => {
    if (step !== 2 || slug.length < 3) {
      setSlugState({ checking: false, available: null, reason: null });
      return;
    }
    let cancelled = false;
    setSlugState({ checking: true, available: null, reason: null });
    const timer = setTimeout(async () => {
      try {
        const res = await checkSlug({ data: { slug } });
        if (!cancelled) setSlugState({ checking: false, available: res.available, reason: res.reason });
      } catch {
        if (!cancelled) setSlugState({ checking: false, available: null, reason: null });
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [slug, step, checkSlug]);

  function next(e: React.FormEvent) {
    e.preventDefault();
    if (form.institution_name.trim().length < 2) return toast.error("Enter your institution's name");
    if (form.contact_name.trim().length < 2) return toast.error("Enter a contact name");
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email)) return toast.error("Enter a valid email");
    setStep(2);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (slugState.available === false) return toast.error(slugState.reason ?? "Pick another address");
    if (form.password.length < 8) return toast.error("Password must be at least 8 characters");
    setSubmitting(true);
    try {
      await provision({
        data: {
          institution_name: form.institution_name.trim(),
          contact_name: form.contact_name.trim(),
          email: form.email.trim(),
          phone: form.phone.trim(),
          city: form.city.trim(),
          slug,
          academic_system: form.academic_system,
          plan_tier_id: form.plan_tier_id || null,
          password: form.password,
        },
      });
      const { error } = await supabase.auth.signInWithPassword({
        email: form.email.trim(),
        password: form.password,
      });
      if (error) {
        toast.success("Workspace created — please sign in.");
        navigate({ to: "/auth" });
        return;
      }
      toast.success("Your workspace is ready. Trial runs for 20 days.");
      navigate({ to: "/dashboard" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create your workspace");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="hairline">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-5">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-sm bg-primary text-primary-foreground">
              <GraduationCap className="h-4 w-4" />
            </div>
            <span className="font-serif text-lg font-semibold tracking-tight">EduCore</span>
          </Link>
          <Link to="/pricing">
            <Button variant="ghost" size="sm">See plans</Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="font-serif text-3xl font-semibold tracking-tight">
          Start your 20-day free trial
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Step {step} of 2 — no card required. Your workspace is ready immediately.
        </p>

        <Card className="mt-8 shadow-none">
          <CardContent className="p-6">
            {step === 1 ? (
              <form onSubmit={next} className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2 sm:col-span-2">
                    <Label htmlFor="institution_name">Institution name</Label>
                    <Input
                      id="institution_name"
                      value={form.institution_name}
                      onChange={(e) => setForm({ ...form, institution_name: e.target.value })}
                      placeholder="Beaconhouse Model College"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="contact_name">Your name</Label>
                    <Input
                      id="contact_name"
                      value={form.contact_name}
                      onChange={(e) => setForm({ ...form, contact_name: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Work email</Label>
                    <Input
                      id="email"
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      value={form.phone}
                      onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="city">City</Label>
                    <Input
                      id="city"
                      value={form.city}
                      onChange={(e) => setForm({ ...form, city: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Examination system</Label>
                  <Select
                    value={form.academic_system}
                    onValueChange={(v) => setForm({ ...form, academic_system: v as typeof form.academic_system })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="board">BISE Board only</SelectItem>
                      <SelectItem value="cambridge">Cambridge only</SelectItem>
                      <SelectItem value="both">Board &amp; Cambridge</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    This decides which examination modules appear. You can change it later.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Plan</Label>
                  <Select
                    value={form.plan_tier_id}
                    onValueChange={(v) => setForm({ ...form, plan_tier_id: v })}
                  >
                    <SelectTrigger><SelectValue placeholder="Choose a plan" /></SelectTrigger>
                    <SelectContent>
                      {(plans ?? []).map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button type="submit" className="w-full">Continue</Button>
              </form>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="slug">Workspace address</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      id="slug"
                      value={slug}
                      onChange={(e) => {
                        setSlugTouched(true);
                        setForm({ ...form, slug: slugify(e.target.value) });
                      }}
                      required
                    />
                    <span className="shrink-0 text-sm text-muted-foreground">.educore.app</span>
                  </div>
                  <p className="flex items-center gap-1.5 text-xs">
                    {slugState.checking && (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" /> Checking availability…
                      </>
                    )}
                    {!slugState.checking && slugState.available === true && (
                      <>
                        <CheckCircle2 className="h-3 w-3 text-primary" />
                        <span className="text-primary">{slug} is available</span>
                      </>
                    )}
                    {!slugState.checking && slugState.available === false && (
                      <span className="text-destructive">{slugState.reason}</span>
                    )}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Create a password</Label>
                  <Input
                    id="password"
                    type="password"
                    minLength={8}
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    You will be the Super Admin for {form.institution_name || "your institution"}.
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button type="button" variant="outline" onClick={() => setStep(1)} disabled={submitting}>
                    Back
                  </Button>
                  <Button type="submit" className="flex-1" disabled={submitting || slugState.available === false}>
                    {submitting ? "Creating your workspace…" : "Create workspace & start trial"}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>

        <p className="mt-6 text-xs text-muted-foreground">
          Already have a workspace? <Link to="/auth" className="underline">Sign in</Link>.
        </p>
      </main>
    </div>
  );
}
