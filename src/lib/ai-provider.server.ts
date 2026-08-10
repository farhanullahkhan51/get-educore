import { createOpenAI } from "@ai-sdk/openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/** Default assistant model. Override with the ASSISTANT_MODEL env var. */
const DEFAULT_CHAT_MODEL = "gpt-5.6-sol";
const DEFAULT_TRANSCRIBE_MODEL = "gpt-4o-transcribe";

export function getChatModelId(): string {
  return process.env["ASSISTANT_MODEL"]?.trim() || DEFAULT_CHAT_MODEL;
}

export function getTranscribeModelId(): string {
  return process.env["ASSISTANT_TRANSCRIBE_MODEL"]?.trim() || DEFAULT_TRANSCRIBE_MODEL;
}

export function getOpenAiKey(): string | undefined {
  return process.env["OPENAI_API_KEY"]?.trim() || undefined;
}

/** OpenAI provider bound to the platform's own account. */
export function createAssistantProvider(apiKey: string) {
  return createOpenAI({ apiKey });
}

/* -------------------- pricing -------------------- */

/** USD per 1M tokens. Unknown models fall back to the default entry. */
const RATES: Record<string, { input: number; output: number }> = {
  default: { input: 1.25, output: 10 },
  "gpt-5.6-sol": { input: 1.25, output: 10 },
  "gpt-5.6-terra": { input: 0.5, output: 4 },
  "gpt-5.6-luna": { input: 0.1, output: 0.8 },
  "gpt-5.5": { input: 1.25, output: 10 },
  "gpt-5.4": { input: 1.25, output: 10 },
  "gpt-5.4-mini": { input: 0.25, output: 2 },
  "gpt-4o-transcribe": { input: 2.5, output: 10 },
};

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const rate = RATES[model] ?? RATES["default"]!;
  return (inputTokens / 1_000_000) * rate.input + (outputTokens / 1_000_000) * rate.output;
}

/* -------------------- usage + caps -------------------- */

export type UsageFeature = "chat" | "voice";

export type CapState = {
  allowed: boolean;
  nearLimit: boolean;
  requests: number;
  costUsd: number;
  requestCap: number | null;
  costCap: number | null;
};

function monthStart(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export async function resolveTenantId(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<string | null> {
  const { data } = await supabase.from("profiles").select("tenant_id").eq("id", userId).maybeSingle();
  return data?.tenant_id ?? null;
}

/**
 * Sum this month's usage for the tenant and compare it against its allowance.
 * Runs before any model call, so a blocked request costs nothing.
 */
export async function checkTenantCap(
  supabase: SupabaseClient<Database>,
  tenantId: string | null,
): Promise<CapState> {
  const idle: CapState = {
    allowed: true,
    nearLimit: false,
    requests: 0,
    costUsd: 0,
    requestCap: null,
    costCap: null,
  };
  if (!tenantId) return idle;

  const [{ data: limit }, { data: rows }] = await Promise.all([
    supabase
      .from("ai_usage_limits")
      .select("monthly_request_cap, monthly_cost_cap_usd, enabled")
      .eq("tenant_id", tenantId)
      .maybeSingle(),
    supabase
      .from("ai_usage")
      .select("requests, cost_usd")
      .eq("tenant_id", tenantId)
      .gte("usage_date", monthStart()),
  ]);

  const requests = (rows ?? []).reduce((sum, r) => sum + (r.requests ?? 0), 0);
  const costUsd = (rows ?? []).reduce((sum, r) => sum + Number(r.cost_usd ?? 0), 0);

  if (!limit || limit.enabled === false) {
    return { ...idle, requests, costUsd };
  }

  const requestCap = limit.monthly_request_cap ?? null;
  const costCap = limit.monthly_cost_cap_usd === null ? null : Number(limit.monthly_cost_cap_usd);

  const ratios = [
    requestCap && requestCap > 0 ? requests / requestCap : 0,
    costCap && costCap > 0 ? costUsd / costCap : 0,
  ];
  const worst = Math.max(...ratios);

  return {
    allowed: worst < 1,
    nearLimit: worst >= 0.8 && worst < 1,
    requests,
    costUsd,
    requestCap,
    costCap,
  };
}

export const CAP_REACHED_MESSAGE =
  "Your institution has reached its monthly AI allowance. Please contact your administrator.";

/** Record one assistant request. Never throws — metering must not break a reply. */
export async function recordUsage(params: {
  tenantId: string | null;
  userId: string;
  feature: UsageFeature;
  model: string;
  inputTokens: number;
  outputTokens: number;
}): Promise<void> {
  if (!params.tenantId) return;
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const cost = estimateCostUsd(params.model, params.inputTokens, params.outputTokens);
    const { error } = await supabaseAdmin.from("ai_usage").insert({
      tenant_id: params.tenantId,
      user_id: params.userId,
      feature: params.feature,
      model: params.model,
      requests: 1,
      input_tokens: Math.round(params.inputTokens),
      output_tokens: Math.round(params.outputTokens),
      cost_usd: Number(cost.toFixed(6)),
    });
    if (error) console.error("[usage] insert failed", error.message);
  } catch (error) {
    console.error("[usage] insert threw", error);
  }
}
