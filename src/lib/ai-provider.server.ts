import { createOpenAI } from "@ai-sdk/openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

/** Default assistant model. Override with the ASSISTANT_MODEL env var. */
const DEFAULT_CHAT_MODEL = "gpt-5.6-sol";
const DEFAULT_TRANSCRIBE_MODEL = "gpt-4o-transcribe";
const DEFAULT_FALLBACK_MODEL = "gemini-2.5-flash";

/** Gemini exposes an OpenAI-compatible surface, so one SDK covers both providers. */
const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/";

export function getChatModelId(): string {
  return process.env["ASSISTANT_MODEL"]?.trim() || DEFAULT_CHAT_MODEL;
}

export function getTranscribeModelId(): string {
  return process.env["ASSISTANT_TRANSCRIBE_MODEL"]?.trim() || DEFAULT_TRANSCRIBE_MODEL;
}

export function getFallbackModelId(): string {
  return process.env["ASSISTANT_FALLBACK_MODEL"]?.trim() || DEFAULT_FALLBACK_MODEL;
}

export function getOpenAiKey(): string | undefined {
  return process.env["OPENAI_API_KEY"]?.trim() || undefined;
}

export function getGeminiKey(): string | undefined {
  return process.env["GEMINI_API_KEY"]?.trim() || undefined;
}

/** OpenAI provider bound to the platform's own account. */
export function createAssistantProvider(apiKey: string) {
  return createOpenAI({ apiKey });
}

/** Gemini provider over its OpenAI-compatible endpoint. */
export function createFallbackProvider(apiKey: string) {
  return createOpenAI({ apiKey, baseURL: GEMINI_BASE_URL });
}

/* -------------------- provider health + switching -------------------- */

export type ProviderName = "openai" | "gemini";

const COOLDOWN_MS = 10 * 60 * 1000;
const PROBE_TTL_MS = 5 * 60 * 1000;

const downUntil: Record<ProviderName, number> = { openai: 0, gemini: 0 };
const probe: Record<ProviderName, { at: number; ok: boolean }> = {
  openai: { at: 0, ok: false },
  gemini: { at: 0, ok: false },
};

/** Mark a provider unhealthy so the next request switches automatically. */
export function markProviderDown(provider: ProviderName, reason?: unknown) {
  downUntil[provider] = Date.now() + COOLDOWN_MS;
  probe[provider] = { at: Date.now(), ok: false };
  console.error(`[ai] ${provider} marked unavailable`, reason instanceof Error ? reason.message : reason);
}

export function isProviderDown(provider: ProviderName): boolean {
  return Date.now() < downUntil[provider];
}

/** Cheap reachability/auth check; cached so it does not add latency per request. */
async function isReachable(provider: ProviderName, apiKey: string, model: string): Promise<boolean> {
  const cached = probe[provider];
  if (Date.now() - cached.at < PROBE_TTL_MS) return cached.ok;
  const url =
    provider === "openai"
      ? `https://api.openai.com/v1/models/${encodeURIComponent(model)}`
      : `${GEMINI_BASE_URL}models`;
  let ok = false;
  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${apiKey}` } });
    ok = res.ok;
    if (!ok) console.error(`[ai] ${provider} probe failed`, res.status);
  } catch (error) {
    console.error(`[ai] ${provider} probe threw`, error);
  }
  probe[provider] = { at: Date.now(), ok };
  return ok;
}

export type SelectedProvider = {
  provider: ProviderName;
  model: string;
  apiKey: string;
  /** true when this is the Gemini fallback rather than the primary provider */
  isFallback: boolean;
};

/**
 * Pick the provider to serve this request: OpenAI when healthy, otherwise
 * Gemini Flash. Falls back on cooldowns set by earlier stream errors too.
 */
export async function selectChatProvider(): Promise<SelectedProvider | null> {
  const openaiKey = getOpenAiKey();
  const geminiKey = getGeminiKey();

  if (openaiKey && !isProviderDown("openai")) {
    if (!geminiKey || (await isReachable("openai", openaiKey, getChatModelId()))) {
      return { provider: "openai", model: getChatModelId(), apiKey: openaiKey, isFallback: false };
    }
  }
  if (geminiKey && !isProviderDown("gemini")) {
    return { provider: "gemini", model: getFallbackModelId(), apiKey: geminiKey, isFallback: true };
  }
  if (openaiKey) {
    return { provider: "openai", model: getChatModelId(), apiKey: openaiKey, isFallback: false };
  }
  return null;
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
  "gemini-2.5-flash": { input: 0.3, output: 2.5 },
  "gemini-2.5-flash-lite": { input: 0.1, output: 0.4 },
  "gemini-2.0-flash": { input: 0.1, output: 0.4 },
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
