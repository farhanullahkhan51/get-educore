import { useCallback, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Recorder = {
  stream: MediaStream;
  ctx: AudioContext;
  source: MediaStreamAudioSourceNode;
  node: ScriptProcessorNode;
  chunks: Float32Array[];
};

function encodeWav(chunks: Float32Array[], sampleRate: number, targetRate = 16000) {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const merged = new Float32Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.length;
  }

  const ratio = sampleRate / targetRate;
  const outLength = Math.floor(merged.length / ratio);
  const samples = new Int16Array(outLength);
  for (let i = 0; i < outLength; i += 1) {
    const s = Math.max(-1, Math.min(1, merged[Math.floor(i * ratio)] ?? 0));
    samples[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }

  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const writeStr = (pos: number, str: string) => {
    for (let i = 0; i < str.length; i += 1) view.setUint8(pos + i, str.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, targetRate, true);
  view.setUint32(28, targetRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, samples.length * 2, true);
  new Int16Array(buffer, 44).set(samples);

  return new Blob([buffer], { type: "audio/wav" });
}

export type VoiceState = "idle" | "recording" | "transcribing";

export function useVoiceInput({
  onTranscript,
  onError,
}: {
  onTranscript: (text: string) => void;
  onError?: (message: string) => void;
}) {
  const [state, setState] = useState<VoiceState>("idle");
  const recorderRef = useRef<Recorder | null>(null);

  const fail = useCallback(
    (message: string) => {
      setState("idle");
      onError?.(message);
    },
    [onError],
  );

  const start = useCallback(async () => {
    if (state !== "idle") return;
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch {
      fail("Microphone access is needed for voice commands.");
      return;
    }

    const AudioCtor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtor) {
      stream.getTracks().forEach((t) => t.stop());
      fail("Voice recording is not supported in this browser.");
      return;
    }

    const ctx = new AudioCtor();
    const source = ctx.createMediaStreamSource(stream);
    const node = ctx.createScriptProcessor(4096, 1, 1);
    const chunks: Float32Array[] = [];
    node.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
    source.connect(node);
    node.connect(ctx.destination);
    recorderRef.current = { stream, ctx, source, node, chunks };
    setState("recording");
  }, [state, fail]);

  const cleanup = useCallback(() => {
    const rec = recorderRef.current;
    recorderRef.current = null;
    if (!rec) return null;
    rec.node.onaudioprocess = null;
    rec.node.disconnect();
    rec.source.disconnect();
    rec.stream.getTracks().forEach((t) => t.stop());
    const blob = encodeWav(rec.chunks, rec.ctx.sampleRate);
    void rec.ctx.close();
    return blob;
  }, []);

  const cancel = useCallback(() => {
    cleanup();
    setState("idle");
  }, [cleanup]);

  const stop = useCallback(async () => {
    if (state !== "recording") return;
    const blob = cleanup();
    if (!blob || blob.size < 4096) {
      fail("That recording was empty — please try again.");
      return;
    }

    setState("transcribing");
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      const body = new FormData();
      body.append("audio", blob, "recording.wav");
      const res = await fetch("/api/transcribe", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        body,
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        fail(detail || "Could not transcribe that recording.");
        return;
      }
      const json = (await res.json()) as { text?: string };
      const text = (json.text ?? "").trim();
      setState("idle");
      if (!text) {
        onError?.("I didn't catch that — please try again.");
        return;
      }
      onTranscript(text);
    } catch {
      fail("Could not reach the transcription service.");
    }
  }, [state, cleanup, fail, onTranscript, onError]);

  return { state, start, stop, cancel, toggle: () => (state === "recording" ? stop() : start()) };
}
