import { createFileRoute } from "@tanstack/react-router";
import { sendEmail, brandedHtml } from "@/lib/email.server";

/**
 * Daily job: sends trial reminder emails on day 6, day 14 and on expiry.
 * Call with `Authorization: Bearer <BILLING_CRON_SECRET>`.
 */
export const Route = createFileRoute("/api/public/billing/reminders")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["BILLING_CRON_SECRET"];
        const auth = request.headers.get("authorization") ?? "";
        if (!secret || auth !== `Bearer ${secret}`) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const origin = new URL(request.url).origin;

        const { data: subs, error } = await supabaseAdmin
          .from("subscriptions")
          .select("tenant_id, status, trial_ends_at, billing_email")
          .eq("status", "trialing")
          .not("trial_ends_at", "is", null);
        if (error) return new Response(error.message, { status: 500 });

        const results: Array<{ tenant: string; kind: string; ok: boolean }> = [];

        for (const sub of subs ?? []) {
          const ends = new Date(sub.trial_ends_at as string);
          const daysLeft = Math.ceil((ends.getTime() - Date.now()) / 86_400_000);

          // Day 6 → 14 left, day 14 → 6 left, expiry → 0 or less.
          let kind: "day6" | "day14" | "expiry" | null = null;
          if (daysLeft <= 0) kind = "expiry";
          else if (daysLeft === 6) kind = "day14";
          else if (daysLeft === 14) kind = "day6";
          if (!kind) continue;

          const { data: already } = await supabaseAdmin
            .from("billing_reminders")
            .select("id")
            .eq("tenant_id", sub.tenant_id)
            .eq("kind", kind)
            .maybeSingle();
          if (already) continue;

          const { data: tenant } = await supabaseAdmin
            .from("tenants")
            .select("name, slug")
            .eq("id", sub.tenant_id)
            .single();
          const { data: settings } = await supabaseAdmin
            .from("tenant_settings")
            .select("primary_color, email_sender_name")
            .eq("tenant_id", sub.tenant_id)
            .maybeSingle();

          const to = sub.billing_email;
          const institution = tenant?.name ?? "Your institution";
          const heading =
            kind === "expiry"
              ? "Your free trial has ended"
              : `${daysLeft} days left in your free trial`;
          const body =
            kind === "expiry"
              ? "<p>Your workspace is now read-only: all your data is safe and viewable, but new records cannot be added until a plan is active.</p><p>Choose a plan to pick up exactly where you left off.</p>"
              : `<p>Your free trial ends in ${daysLeft} days. Choose a plan now to keep admissions, fees, academics and certificates running without interruption.</p>`;

          let sent = { ok: false, error: "No billing email on file" } as {
            ok: boolean;
            error?: string;
            skipped?: boolean;
          };
          if (to) {
            sent = await sendEmail({
              to,
              subject: `${institution} — ${heading}`,
              fromName: settings?.email_sender_name || institution,
              html: brandedHtml({
                institution,
                color: settings?.primary_color,
                heading,
                body,
                ctaLabel: "Choose a plan",
                ctaUrl: `${origin}/billing`,
              }),
            });
          }

          await supabaseAdmin.from("billing_reminders").insert({
            tenant_id: sub.tenant_id,
            kind,
            email: to,
            status: sent.ok ? "sent" : sent.skipped ? "skipped" : "failed",
            error: sent.error ?? null,
          });

          results.push({ tenant: sub.tenant_id, kind, ok: sent.ok });
        }

        return Response.json({ processed: results.length, results });
      },
    },
  },
});
