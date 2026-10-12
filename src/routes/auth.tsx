import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { GraduationCap } from "lucide-react";
import { useTenant } from "@/lib/tenant-context";
import { PENDING_CLAIM_KEY, runPendingClaim } from "@/components/portal/claim-student-form";
import { Checkbox } from "@/components/ui/checkbox";

function safeNext(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  // Same-origin relative paths only.
  return value.startsWith("/") && !value.startsWith("//") ? value : undefined;
}

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>): { next?: string } => ({ next: safeNext(s.next) }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const { next } = Route.useSearch();
  const { tenant } = useTenant();
  const brandName = tenant?.name ?? "EduCore";
  const [loading, setLoading] = useState(false);
  const [isStudent, setIsStudent] = useState(false);

  function goOn() {
    if (next) {
      window.location.href = next;
      return;
    }
    navigate({ to: "/dashboard" });
  }

  /** If a student/parent registration is waiting, activate it and open the portal. */
  async function finishPendingClaim(): Promise<boolean> {
    const res = await runPendingClaim();
    if (!res) return false;
    if (res.ok) {
      toast.success("Student portal activated");
      navigate({ to: "/portal" });
    } else {
      toast.error(res.message);
      navigate({ to: "/portal" });
    }
    return true;
  }

  async function handleSignIn(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: String(fd.get("email")),
      password: String(fd.get("password")),
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Welcome back");
    if (await finishPendingClaim()) return;
    goOn();
  }

  async function handleSignUp(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const code = String(fd.get("student_code") ?? "").trim();
    const phone = String(fd.get("guardian_phone") ?? "").trim();
    if (isStudent) {
      if (!code || phone.replace(/\D/g, "").length < 9) {
        return toast.error("Enter the student code and a valid guardian phone number");
      }
      localStorage.setItem(PENDING_CLAIM_KEY, JSON.stringify({ code, phone }));
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email: String(fd.get("email")),
      password: String(fd.get("password")),
      options: {
        emailRedirectTo: `${window.location.origin}/auth`,
        data: { full_name: String(fd.get("full_name")) },
      },
    });
    setLoading(false);
    if (error) {
      localStorage.removeItem(PENDING_CLAIM_KEY);
      return toast.error(error.message);
    }
    if (!data.session) {
      toast.success(
        isStudent
          ? "Account created. Confirm your email, then sign in — your portal activates automatically."
          : "Account created. Check your email if confirmation is required.",
      );
      return;
    }
    if (await finishPendingClaim()) return;
    toast.success("Account created");
    goOn();
  }

  async function handleGoogle() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: `${window.location.origin}${next ?? ""}`,
    });
    if (result.error) toast.error("Google sign-in failed");
    if (!result.redirected && !result.error) goOn();
  }

  return (
    <div className="grid min-h-screen lg:grid-cols-2">
      <div className="relative hidden bg-primary text-primary-foreground lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="flex items-center gap-2">
          {tenant?.logo_url ? (
            <img src={tenant.logo_url} alt={`${brandName} logo`} className="h-8 w-8 rounded-sm bg-primary-foreground object-contain" />
          ) : (
            <div className="grid h-8 w-8 place-items-center rounded-sm bg-primary-foreground text-primary">
              <GraduationCap className="h-4 w-4" />
            </div>
          )}
          <span className="font-serif text-lg font-semibold">{brandName}</span>
        </div>
        <div>
          <p className="max-w-md font-serif text-3xl leading-tight">
            "A school is only as strong as the records it keeps and the people it remembers."
          </p>
          <p className="mt-4 text-sm opacity-70">{brandName} Administrative Handbook</p>
        </div>
        <div className="text-xs opacity-70">Institution-grade access · Audited · RLS-enforced</div>
      </div>

      <div className="flex items-center justify-center p-6">
        <Card className="w-full max-w-md border-border shadow-none">
          <CardHeader>
            <CardTitle className="font-serif text-2xl">Institution portal</CardTitle>
            <CardDescription>Sign in or register to access your dashboard.</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="signin">
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="signin">Sign in</TabsTrigger>
                <TabsTrigger value="signup">Register</TabsTrigger>
              </TabsList>

              <TabsContent value="signin" className="mt-6">
                <form onSubmit={handleSignIn} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="si-email">Email</Label>
                    <Input id="si-email" name="email" type="email" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="si-pw">Password</Label>
                    <Input id="si-pw" name="password" type="password" required />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Signing in…" : "Sign in"}
                  </Button>
                </form>
              </TabsContent>

              <TabsContent value="signup" className="mt-6">
                <form onSubmit={handleSignUp} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="su-name">Full name</Label>
                    <Input id="su-name" name="full_name" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="su-email">Email</Label>
                    <Input id="su-email" name="email" type="email" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="su-pw">Password</Label>
                    <Input id="su-pw" name="password" type="password" required minLength={8} />
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <Checkbox checked={isStudent} onCheckedChange={(v) => setIsStudent(v === true)} />
                    I am a student / parent
                  </label>
                  {isStudent && (
                    <div className="space-y-4 rounded-md border border-border p-3">
                      <div className="space-y-2">
                        <Label htmlFor="su-code">Student code / Roll no.</Label>
                        <Input id="su-code" name="student_code" required maxLength={40} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="su-phone">Guardian phone registered with the school</Label>
                        <Input id="su-phone" name="guardian_phone" required maxLength={20} inputMode="tel" />
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Your portal opens automatically once these match the school's records.
                      </p>
                    </div>
                  )}
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Creating…" : "Register"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>

            <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
              <div className="h-px flex-1 bg-border" /> OR <div className="h-px flex-1 bg-border" />
            </div>
            <Button variant="outline" className="w-full" onClick={handleGoogle}>
              Continue with Google
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
