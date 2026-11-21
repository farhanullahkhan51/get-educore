/**
 * Server-only email sending for billing notifications.
 * Uses Resend when RESEND_API_KEY is configured; otherwise reports "skipped"
 * so the caller can record the attempt without failing.
 */
export type SendResult = { ok: boolean; skipped?: boolean; error?: string };

export async function sendEmail(opts: {
  to: string;
  subject: string;
  html: string;
  fromName?: string;
}): Promise<SendResult> {
  const key = process.env["RESEND_API_KEY"];
  if (!key) return { ok: false, skipped: true, error: "No email provider configured" };

  const from = `${opts.fromName || "Billing"} <${process.env["BILLING_FROM_EMAIL"] || "onboarding@resend.dev"}>`;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [opts.to], subject: opts.subject, html: opts.html }),
    });
    if (!res.ok) return { ok: false, error: `${res.status} ${await res.text()}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Send failed" };
  }
}

/** Escape untrusted text before inserting it into email HTML. */
export function escapeEmailText(v: unknown): string {
  return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Simple branded email body using the institution's own name and colour. */
export function brandedHtml(opts: {
  institution: string;
  color?: string | null;
  heading: string;
  body: string;
  ctaLabel?: string;
  ctaUrl?: string;
}) {
  const esc = (v: unknown) =>
    String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const color = opts.color && /^#[0-9a-fA-F]{3,8}$/.test(opts.color) ? opts.color : "#1f2937";
  const institution = esc(opts.institution);
  const heading = esc(opts.heading);
  const ctaUrl = opts.ctaUrl && /^https:\/\//i.test(opts.ctaUrl) ? esc(opts.ctaUrl) : "";
  const ctaLabel = esc(opts.ctaLabel);
  const cta =
    opts.ctaLabel && ctaUrl
      ? `<p style="margin:24px 0"><a href="${ctaUrl}" style="background:${color};color:#fff;padding:10px 18px;border-radius:4px;text-decoration:none;font-size:14px">${ctaLabel}</a></p>`
      : "";
  return `<div style="font-family:Georgia,serif;max-width:560px;margin:0 auto;color:#111">
    <p style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:${color}">${institution}</p>
    <h1 style="font-size:20px;margin:8px 0 16px">${heading}</h1>
    <div style="font-family:Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#333">${opts.body}</div>
    ${cta}
    <p style="font-family:Helvetica,Arial,sans-serif;font-size:12px;color:#888;margin-top:32px">
      You are receiving this because you manage ${institution}.
    </p>
  </div>`;
}
