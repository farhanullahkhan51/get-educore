import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const requestSchema = z.object({
  plan_tier_id: z.string().uuid(),
  billing_cycle: z.enum(["monthly", "yearly"]),
  currency: z.enum(["PKR", "USD"]),
});

/** Tenant admin asks for a bank-transfer invoice for a plan. */
export const requestBankTransferInvoice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => requestSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: isAdmin } = await supabase.rpc("is_super_admin", { _user_id: userId });
    if (!isAdmin) throw new Error("Only a Super Admin can request an invoice");

    const { data: tenantId } = await supabase.rpc("get_user_tenant", { _user_id: userId });
    if (!tenantId) throw new Error("No institution is linked to your account");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: plan, error: planError } = await supabaseAdmin
      .from("plan_tiers")
      .select("id, name, price_monthly_pkr, price_yearly_pkr, price_monthly_usd, price_yearly_usd")
      .eq("id", data.plan_tier_id)
      .single();
    if (planError || !plan) throw new Error("Plan not found");

    const amount =
      data.currency === "PKR"
        ? data.billing_cycle === "yearly"
          ? plan.price_yearly_pkr
          : plan.price_monthly_pkr
        : data.billing_cycle === "yearly"
          ? plan.price_yearly_usd
          : plan.price_monthly_usd;
    if (amount == null) throw new Error("This plan has no published price. Contact support.");

    // Refuse duplicates while one is still pending.
    const { data: pending } = await supabaseAdmin
      .from("invoices")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("status", "pending")
      .maybeSingle();
    if (pending) throw new Error("You already have a pending invoice awaiting confirmation.");

    const start = new Date();
    const end = new Date(start);
    if (data.billing_cycle === "yearly") end.setFullYear(end.getFullYear() + 1);
    else end.setMonth(end.getMonth() + 1);

    const { count } = await supabaseAdmin
      .from("invoices")
      .select("id", { count: "exact", head: true });
    const invoiceNo = `INV-${start.getFullYear()}-${String((count ?? 0) + 1).padStart(5, "0")}`;

    const { data: invoice, error } = await supabaseAdmin
      .from("invoices")
      .insert({
        tenant_id: tenantId,
        invoice_no: invoiceNo,
        plan_tier_id: plan.id,
        billing_cycle: data.billing_cycle,
        amount,
        currency: data.currency,
        period_start: start.toISOString().slice(0, 10),
        period_end: end.toISOString().slice(0, 10),
        channel: "bank_transfer",
        status: "pending",
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    return invoice;
  });

const proofSchema = z.object({
  invoice_id: z.string().uuid(),
  reference: z.string().trim().min(3).max(120),
  proof_url: z.string().trim().url().max(500).optional().or(z.literal("")),
});

/** Tenant admin attaches a transfer reference / proof to a pending invoice. */
export const submitPaymentProof = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => proofSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("invoices")
      .update({
        reference: data.reference,
        proof_url: data.proof_url || null,
        status: "pending",
      })
      .eq("id", data.invoice_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const markPaidSchema = z.object({
  invoice_id: z.string().uuid(),
});

/** Platform owner confirms a bank transfer and activates the institution. */
export const markInvoicePaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => markPaidSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isOwner } = await supabase.rpc("is_platform_owner", { _user_id: userId });
    if (!isOwner) throw new Error("Only the platform owner can confirm payments");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: invoice, error } = await supabaseAdmin
      .from("invoices")
      .update({ status: "paid", paid_on: new Date().toISOString().slice(0, 10), marked_by: userId })
      .eq("id", data.invoice_id)
      .select("*")
      .single();
    if (error || !invoice) throw new Error(error?.message ?? "Invoice not found");

    await supabaseAdmin
      .from("subscriptions")
      .upsert(
        {
          tenant_id: invoice.tenant_id,
          plan_tier_id: invoice.plan_tier_id!,
          billing_cycle: invoice.billing_cycle,
          status: "active",
          payment_channel: "bank_transfer",
          current_period_start: invoice.period_start,
          current_period_end: invoice.period_end
            ? new Date(invoice.period_end).toISOString()
            : null,
        },
        { onConflict: "tenant_id" },
      );

    await supabaseAdmin
      .from("tenants")
      .update({ status: "active", plan_tier_id: invoice.plan_tier_id })
      .eq("id", invoice.tenant_id);

    // Confirmation email to the institution's billing contact.
    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select("billing_email")
      .eq("tenant_id", invoice.tenant_id)
      .maybeSingle();
    if (sub?.billing_email) {
      const { data: tenant } = await supabaseAdmin
        .from("tenants")
        .select("name")
        .eq("id", invoice.tenant_id)
        .single();
      const { data: settings } = await supabaseAdmin
        .from("tenant_settings")
        .select("primary_color, email_sender_name")
        .eq("tenant_id", invoice.tenant_id)
        .maybeSingle();
      const { sendEmail, brandedHtml, escapeEmailText } = await import("@/lib/email.server");
      const institution = tenant?.name ?? "Your institution";
      await sendEmail({
        to: sub.billing_email,
        subject: `${institution} — payment received (${invoice.invoice_no})`,
        fromName: settings?.email_sender_name || institution,
        html: brandedHtml({
          institution,
          color: settings?.primary_color,
          heading: "Payment received — your plan is active",
          body: `<p>We have confirmed your bank transfer for invoice <strong>${escapeEmailText(invoice.invoice_no)}</strong>.</p>
                 <p>Your workspace is fully active${invoice.period_end ? ` until ${escapeEmailText(invoice.period_end)}` : ""}. Thank you.</p>`,
        }),
      });
      await supabaseAdmin
        .from("billing_reminders")
        .delete()
        .eq("tenant_id", invoice.tenant_id)
        .in("kind", ["day6", "day14", "expiry"]);
    }

    return { ok: true };
  });

const trialSchema = z.object({ tenant_id: z.string().uuid(), days: z.number().int().min(1).max(120) });

/** Platform owner extends an institution's trial. */
export const extendTrial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => trialSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { data: isOwner } = await context.supabase.rpc("is_platform_owner", {
      _user_id: context.userId,
    });
    if (!isOwner) throw new Error("Only the platform owner can extend trials");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select("trial_ends_at")
      .eq("tenant_id", data.tenant_id)
      .maybeSingle();

    const base = sub?.trial_ends_at ? new Date(sub.trial_ends_at) : new Date();
    const from = base > new Date() ? base : new Date();
    const next = new Date(from.getTime() + data.days * 24 * 60 * 60 * 1000).toISOString();

    const { error } = await supabaseAdmin
      .from("subscriptions")
      .update({ trial_ends_at: next, status: "trialing" })
      .eq("tenant_id", data.tenant_id);
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("tenants").update({ status: "trial" }).eq("id", data.tenant_id);
    return { trialEndsAt: next };
  });
