import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, GraduationCap, Minus } from "lucide-react";
import { FEATURES } from "@/lib/entitlements";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: "Pricing — EduCore Academic ERP" },
      {
        name: "description",
        content:
          "Simple plans for schools and colleges: admissions, fees, attendance, results and certificates. Start a 20-day free trial, no card required.",
      },
      { property: "og:title", content: "Pricing — EduCore Academic ERP" },
      {
        property: "og:description",
        content: "Starter, Pro and Enterprise plans for Board and Cambridge institutions. 20-day free trial.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PricingPage,
});

type Plan = {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
  student_limit: number | null;
  campus_limit: number | null;
  staff_limit: number | null;
  ai_message_limit: number | null;
  feature_flags: Record<string, boolean> | null;
  price_monthly_usd: number | null;
  price_yearly_usd: number | null;
  price_monthly_pkr: number | null;
  price_yearly_pkr: number | null;
};

const money = (value: number | null, currency: "PKR" | "USD") =>
  value == null
    ? "—"
    : new Intl.NumberFormat(currency === "PKR" ? "en-PK" : "en-US", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }).format(value);

function PricingPage() {
  const [yearly, setYearly] = useState(false);
  const [currency, setCurrency] = useState<"PKR" | "USD">("PKR");

  const { data: plans } = useQuery({
    queryKey: ["public.plans"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("plan_tiers")
        .select(
          "id, name, description, sort_order, student_limit, campus_limit, staff_limit, ai_message_limit, feature_flags, price_monthly_usd, price_yearly_usd, price_monthly_pkr, price_yearly_pkr",
        )
        .eq("is_public", true)
        .order("sort_order");
      if (error) throw error;
      return data as unknown as Plan[];
    },
  });

  const price = (p: Plan) =>
    currency === "PKR"
      ? yearly
        ? p.price_yearly_pkr
        : p.price_monthly_pkr
      : yearly
        ? p.price_yearly_usd
        : p.price_monthly_usd;

  const cap = (value: number | null) => (value == null ? "Unlimited" : value.toLocaleString());

  return (
    <div className="min-h-screen bg-background">
      <header className="hairline">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-sm bg-primary text-primary-foreground">
              <GraduationCap className="h-4 w-4" />
            </div>
            <span className="font-serif text-lg font-semibold tracking-tight">EduCore</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link to="/auth">
              <Button variant="ghost" size="sm">Sign in</Button>
            </Link>
            <Link to="/signup" search={{ plan: undefined }}>
              <Button size="sm">Start free trial</Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-16">
        <h1 className="font-serif text-4xl font-semibold tracking-tight md:text-5xl">
          Plans that grow with your institution
        </h1>
        <p className="mt-4 max-w-2xl text-muted-foreground">
          Every plan includes students, staff, classes, attendance, gradebook, results, fees and
          admissions. Start with a 20-day free trial — no card required.
        </p>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-sm border p-0.5">
            <button
              type="button"
              onClick={() => setYearly(false)}
              className={`rounded-sm px-3 py-1.5 text-sm ${!yearly ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              Monthly
            </button>
            <button
              type="button"
              onClick={() => setYearly(true)}
              className={`rounded-sm px-3 py-1.5 text-sm ${yearly ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              Yearly <span className="opacity-70">(2 months free)</span>
            </button>
          </div>
          <div className="inline-flex rounded-sm border p-0.5">
            {(["PKR", "USD"] as const).map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCurrency(c)}
                className={`rounded-sm px-3 py-1.5 text-sm ${currency === c ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {(plans ?? []).map((p, i) => {
            const flags = p.feature_flags ?? {};
            const featured = i === 1;
            return (
              <Card key={p.id} className={featured ? "border-primary shadow-sm" : "shadow-none"}>
                <CardContent className="space-y-5 p-6">
                  <div className="flex items-center justify-between">
                    <h2 className="font-serif text-2xl font-semibold">{p.name}</h2>
                    {featured && <Badge>Most popular</Badge>}
                  </div>
                  <p className="min-h-10 text-sm text-muted-foreground">{p.description}</p>
                  <div>
                    <span className="font-serif text-3xl font-semibold">{money(price(p), currency)}</span>
                    <span className="text-sm text-muted-foreground"> / {yearly ? "year" : "month"}</span>
                  </div>
                  <Link to="/signup" search={{ plan: p.id }}>
                    <Button className="w-full" variant={featured ? "default" : "outline"}>
                      Start 20-day free trial
                    </Button>
                  </Link>
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-primary" /> {cap(p.campus_limit)} campuses
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-primary" /> {cap(p.student_limit)} students
                    </li>
                    <li className="flex items-center gap-2">
                      <Check className="h-4 w-4 text-primary" /> {cap(p.staff_limit)} staff
                    </li>
                    {FEATURES.map((f) => {
                      const on = flags[f.key] !== false;
                      return (
                        <li
                          key={f.key}
                          className={`flex items-center gap-2 ${on ? "" : "text-muted-foreground/60"}`}
                        >
                          {on ? (
                            <Check className="h-4 w-4 shrink-0 text-primary" />
                          ) : (
                            <Minus className="h-4 w-4 shrink-0" />
                          )}
                          {f.label}
                        </li>
                      );
                    })}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <p className="mt-10 text-sm text-muted-foreground">
          Prefer to pay by bank transfer? Start the trial and choose “Pay by bank transfer” in
          Billing — we will issue an invoice and activate your plan once payment lands.
        </p>
      </main>
    </div>
  );
}
