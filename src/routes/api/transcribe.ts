import { createFileRoute } from "@tanstack/react-router";
import { getRequestUser } from "@/lib/supabase-request.server";
import {
  CAP_REACHED_MESSAGE,
  checkTenantCap,
  getFallbackModelId,
  getGeminiKey,
  getOpenAiKey,
  getTranscribeModelId,
  isProviderDown,
  markProviderDown,
  recordUsage,
  resolveTenantId,
} from "@/lib/ai-provider.server";

const MAX_BYTES = 20 * 1024 * 1024;

/** Gemini Flash transcription over the OpenAI-compatible chat endpoint. */
async function transcribeWithGemini(apiKey: string, audio: File, instruction: string) {
  const model = getFallbackModelId();
  const base64 = Buffer.from(await audio.arrayBuffer()).toString("base64");
  const res = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: instruction },
            { type: "input_audio", input_audio: { data: base64, format: "wav" } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    markProviderDown("gemini", detail);
    throw new Error(`gemini transcription failed: ${res.status}`);
  }
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  return {
    model,
    text: json.choices?.[0]?.message?.content ?? "",
    inputTokens: json.usage?.prompt_tokens ?? 0,
    outputTokens: json.usage?.completion_tokens ?? 0,
  };
}

export const Route = createFileRoute("/api/transcribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const auth = await getRequestUser(request);
        if (!auth) return new Response("Unauthorized", { status: 401 });

        const apiKey = getOpenAiKey();
        const geminiKey = getGeminiKey();
        if (!apiKey && !geminiKey) return new Response("AI is not configured", { status: 500 });

        const tenantId = await resolveTenantId(auth.supabase, auth.userId);
        const cap = await checkTenantCap(auth.supabase, tenantId);
        if (!cap.allowed) return new Response(CAP_REACHED_MESSAGE, { status: 429 });



        const form = await request.formData();
        const audio = form.get("audio");
        if (!(audio instanceof File) || audio.size === 0) {
          return new Response("Audio file is required", { status: 400 });
        }
        if (audio.size > MAX_BYTES) {
          return new Response("Recording is too long", { status: 413 });
        }

        const requested = String(form.get("language") ?? "auto");
        const language = requested === "en" || requested === "ur" ? requested : null;

        const model = getTranscribeModelId();
        const upstream = new FormData();
        upstream.append("model", model);
        upstream.append("file", audio, "recording.wav");
        if (language) {
          upstream.append("language", language);
          upstream.append(
            "prompt",
            language === "en"
              ? "Transcribe verbatim in English using Latin script. Never output Urdu script."
              : "Transcribe verbatim in Urdu using Urdu script. Never transliterate into Latin script.",
          );
        } else {
          // No `language` field: let the model auto-detect. The prompt keeps it from
          // defaulting to Urdu script when the speaker is actually using English.
          upstream.append(
            "prompt",
            "Transcribe verbatim in the language actually spoken. If the speaker uses English, output English in Latin script. If the speaker uses Urdu, output Urdu in Urdu script. Never translate or transliterate between the two.",
          );
        }

        const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}` },
          body: upstream,
        });

        if (!response.ok) {
          const detail = await response.text().catch(() => "");
          console.error("[transcribe] provider error", response.status, detail);
          return new Response("Transcription failed", { status: response.status });
        }

        const data = (await response.json()) as {
          text?: string;
          usage?: { input_tokens?: number; output_tokens?: number };
        };
        await recordUsage({
          tenantId,
          userId: auth.userId,
          feature: "voice",
          model,
          inputTokens: data.usage?.input_tokens ?? 0,
          outputTokens: data.usage?.output_tokens ?? 0,
        });
        return Response.json({ text: data.text ?? "" });

      },
    },
  },
});
