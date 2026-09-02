import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const TRIAL_DAYS = 20;

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9-]{2,30}$/, "Use 3-31 letters, numbers or hyphens");

const signupSchema = z.object({
  institution_name: z.string().trim().min(2).max(140),
  contact_name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(160),
  phone: z.string().trim().max(30).optional().or(z.literal("")),
  city: z.string().trim().max(80).optional().or(z.literal("")),
  slug: slugSchema,
  academic_system: z.enum(["board", "cambridge", "both"]),
  plan_tier_id: z.string().uuid().nullable(),
  password: z.string().min(8, "Use at least 8 characters").max(72),
});

export type SignupInput = z.infer<typeof signupSchema>;

/** Public: is this workspace address free and allowed? */
export const checkWorkspaceSlug = createServerFn({ method: "POST" })
  .inputValidator((input: { slug: string }) => ({ slug: String(input?.slug ?? "").toLowerCase() }))
  .handler(async ({ data }) => {
    const parsed = slugSchema.safeParse(data.slug);
    if (!parsed.success) {
      return { available: false, reason: parsed.error.issues[0]?.message ?? "Invalid address" };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ok, error } = await supabaseAdmin.rpc("slug_available", { _slug: parsed.data });
    if (error) return { available: false, reason: "Could not check availability" };
    return ok
      ? { available: true, reason: null }
      : { available: false, reason: "That address is taken or reserved" };
  });

/**
 * Public: provision a brand-new institution with a 20-day trial.
 * Creates tenant + settings + subscription + the first Super Admin account.
 */
export const provisionInstitution = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => signupSchema.parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getRequestHeader } = await import("@tanstack/react-start/server");

    // Anti-abuse: cap signups from one email and from one network, per hour.
    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recent } = await supabaseAdmin
      .from("signup_requests")
      .select("id", { count: "exact", head: true })
      .eq("email", data.email)
      .gte("created_at", since);
    if ((recent ?? 0) >= 3) throw new Error("Too many signups from this email. Please try again later.");

    const ip =
      (getRequestHeader("cf-connecting-ip") ??
        getRequestHeader("x-forwarded-for")?.split(",")[0] ??
        "")
        .trim() || null;
    let ipHash: string | null = null;
    if (ip) {
      const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ip));
      ipHash = Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const { count: fromIp } = await supabaseAdmin
        .from("signup_requests")
        .select("id", { count: "exact", head: true })
        .eq("ip_hash", ipHash)
        .gte("created_at", since);
      if ((fromIp ?? 0) >= 5) {
        throw new Error("Too many signups from this network. Please try again later.");
      }
    }

    const { data: slugOk } = await supabaseAdmin.rpc("slug_available", { _slug: data.slug });
    if (!slugOk) throw new Error("That workspace address is no longer available.");

    const trialEnds = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000).toISOString();

    // 1. Tenant
    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from("tenants")
      .insert({
        name: data.institution_name,
        slug: data.slug,
        status: "trial",
        academic_system: data.academic_system,
        plan_tier_id: data.plan_tier_id,
      })
      .select("id")
      .single();
    if (tenantError || !tenant) throw new Error(tenantError?.message ?? "Could not create the workspace");

    const rollback = async () => {
      await supabaseAdmin.from("tenants").delete().eq("id", tenant.id);
    };

    // 2. Settings + subscription
    const { error: settingsError } = await supabaseAdmin.from("tenant_settings").insert({
      tenant_id: tenant.id,
      default_currency: "PKR",
      default_timezone: "Asia/Karachi",
      email_sender_name: data.institution_name,
    });
    if (settingsError) {
      await rollback();
      throw new Error(settingsError.message);
    }

    if (data.plan_tier_id) {
      const { error: subError } = await supabaseAdmin.from("subscriptions").insert({
        tenant_id: tenant.id,
        plan_tier_id: data.plan_tier_id,
        billing_cycle: "monthly",
        status: "trialing",
        trial_ends_at: trialEnds,
        billing_email: data.email,
        payment_channel: "none",
      });
      if (subError) {
        await rollback();
        throw new Error(subError.message);
      }
    }

    // 3. First Super Admin account
    const { data: created, error: userError } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.contact_name },
    });
    if (userError || !created.user) {
      await rollback();
      throw new Error(userError?.message ?? "Could not create your account");
    }
    const userId = created.user.id;

    await supabaseAdmin
      .from("profiles")
      .upsert(
        { id: userId, full_name: data.contact_name, email: data.email, phone: data.phone || null, tenant_id: tenant.id },
        { onConflict: "id" },
      );

    await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", userId);
    const { error: roleError } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role: "super_admin", tenant_id: tenant.id });
    if (roleError) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      await rollback();
      throw new Error(roleError.message);
    }

    // 4. Audit the signup
    await supabaseAdmin.from("signup_requests").insert({
      institution_name: data.institution_name,
      contact_name: data.contact_name,
      email: data.email,
      phone: data.phone || null,
      city: data.city || null,
      requested_slug: data.slug,
      academic_system: data.academic_system,
      plan_tier_id: data.plan_tier_id,
      tenant_id: tenant.id,
      ip_hash: ipHash,
      status: "provisioned",
    });

    return { tenantId: tenant.id, slug: data.slug, trialEndsAt: trialEnds };
  });
