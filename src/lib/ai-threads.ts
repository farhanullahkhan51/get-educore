import { supabase } from "@/integrations/supabase/client";
import type { UIMessage } from "ai";

export type AiThread = {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

export async function listThreads(): Promise<AiThread[]> {
  const { data, error } = await supabase
    .from("ai_threads")
    .select("id, title, created_at, updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function createThread(userId: string, tenantId: string | null, title = "New conversation") {
  const { data, error } = await supabase
    .from("ai_threads")
    .insert({ user_id: userId, tenant_id: tenantId, title })
    .select("id, title, created_at, updated_at")
    .single();
  if (error) throw error;
  return data as AiThread;
}

export async function renameThread(id: string, title: string) {
  const { error } = await supabase.from("ai_threads").update({ title }).eq("id", id);
  if (error) throw error;
}

export async function deleteThread(id: string) {
  const { error } = await supabase.from("ai_threads").delete().eq("id", id);
  if (error) throw error;
}

export async function loadThreadMessages(threadId: string): Promise<UIMessage[]> {
  const { data, error } = await supabase
    .from("ai_messages")
    .select("id, role, parts, client_id")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.client_id ?? row.id,
    role: row.role as UIMessage["role"],
    parts: (row.parts ?? []) as UIMessage["parts"],
  }));
}
