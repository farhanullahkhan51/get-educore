import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, MessageSquare, Trash2, PanelLeft, Mic, Square, Loader2 } from "lucide-react";
import { useVoiceInput } from "@/hooks/use-voice-input";

import { supabase } from "@/integrations/supabase/client";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useTenantId } from "@/lib/tenant-context";
import {
  createThread,
  deleteThread,
  listThreads,
  loadThreadMessages,
  renameThread,
} from "@/lib/ai-threads";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Tool, ToolContent, ToolHeader, ToolInput, ToolOutput } from "@/components/ai-elements/tool";

const SUGGESTIONS = [
  "How many active students and staff do we have per campus?",
  "Summarise fee collection and outstanding dues.",
  "What does the admissions funnel look like right now?",
  "Give me attendance for the last 30 days.",
];

function ThreadList({
  activeId,
  onNavigate,
}: {
  activeId: string;
  onNavigate?: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: user } = useCurrentUser();
  const tenantId = useTenantId();

  const { data: threads } = useQuery({ queryKey: ["ai-threads"], queryFn: listThreads });

  const newChat = useMutation({
    mutationFn: async () => createThread(user!.userId, tenantId),
    onSuccess: (thread) => {
      queryClient.invalidateQueries({ queryKey: ["ai-threads"] });
      onNavigate?.();
      navigate({ to: "/assistant/$threadId", params: { threadId: thread.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: deleteThread,
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ["ai-threads"] });
      if (id === activeId) navigate({ to: "/assistant" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="flex h-full flex-col">
      <div className="border-b p-3">
        <Button
          className="w-full justify-start"
          size="sm"
          onClick={() => newChat.mutate()}
          disabled={!user || newChat.isPending}
        >
          <Plus className="mr-2 h-4 w-4" /> New conversation
        </Button>
      </div>
      <div className="flex-1 space-y-1 overflow-y-auto p-2">
        {(threads ?? []).map((t) => (
          <div
            key={t.id}
            className={cn(
              "group flex items-center gap-1 rounded-sm px-1 transition-colors",
              t.id === activeId ? "bg-muted" : "hover:bg-muted/60",
            )}
          >
            <Link
              to="/assistant/$threadId"
              params={{ threadId: t.id }}
              onClick={onNavigate}
              className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-sm"
            >
              <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-60" />
              <span className="truncate">{t.title}</span>
            </Link>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Delete ${t.title}`}
              className="opacity-0 transition-opacity group-hover:opacity-100"
              onClick={() => remove.mutate(t.id)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        {threads?.length === 0 && (
          <p className="px-3 py-6 text-xs text-muted-foreground">
            No conversations yet. Start one to ask about your institution's data.
          </p>
        )}
      </div>
    </div>
  );
}

function MessageParts({ message }: { message: UIMessage }) {
  return (
    <>
      {message.parts.map((part, i) => {
        if (part.type === "text") {
          return message.role === "assistant" ? (
            <MessageResponse key={i}>{part.text}</MessageResponse>
          ) : (
            <span key={i} className="whitespace-pre-wrap">
              {part.text}
            </span>
          );
        }
        if (part.type.startsWith("tool-")) {
          const toolPart = part as unknown as {
            type: string;
            state: string;
            input?: unknown;
            output?: unknown;
            errorText?: string;
          };
          return (
            <Tool key={i} defaultOpen={false} className="my-2">
              <ToolHeader
                type={toolPart.type as never}
                title={toolPart.type.replace("tool-", "").replaceAll("_", " ")}
                state={toolPart.state as never}
              />
              <ToolContent>
                <ToolInput input={toolPart.input} />
                <ToolOutput output={toolPart.output} errorText={toolPart.errorText} />
              </ToolContent>
            </Tool>
          );
        }
        return null;
      })}
    </>
  );
}

export function ChatWorkspace({ threadId }: { threadId: string }) {
  const queryClient = useQueryClient();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [input, setInput] = useState("");
  const titledRef = useRef(false);

  const { data: initialMessages, isLoading } = useQuery({
    queryKey: ["ai-thread-messages", threadId],
    queryFn: () => loadThreadMessages(threadId),
    staleTime: Infinity,
    gcTime: 0,
  });

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        body: { threadId },
        headers: async (): Promise<Record<string, string>> => {
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token;
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
      }),
    [threadId],
  );

  const { messages, sendMessage, status, error } = useChat({
    id: threadId,
    messages: initialMessages ?? [],
    transport,
    onError: (e) => toast.error(e.message || "The assistant could not respond."),
  });

  useEffect(() => {
    titledRef.current = false;
    textareaRef.current?.focus();
  }, [threadId]);

  useEffect(() => {
    if (status === "ready") textareaRef.current?.focus();
  }, [status]);

  async function handleSend(text: string) {
    const value = text.trim();
    if (!value || status === "streaming" || status === "submitted") return;
    setInput("");
    if (!titledRef.current && messages.length === 0) {
      titledRef.current = true;
      const title = value.length > 60 ? `${value.slice(0, 57)}…` : value;
      renameThread(threadId, title)
        .then(() => queryClient.invalidateQueries({ queryKey: ["ai-threads"] }))
        .catch(() => undefined);
    }
    await sendMessage({ text: value });
  }

  const busy = status === "submitted" || status === "streaming";

  const voice = useVoiceInput({
    onTranscript: (text) => {
      setInput(text);
      void handleSend(text);
    },
    onError: (message) => toast.error(message),
  });

  return (
    <div className="flex h-full min-h-0 flex-col">
      <Conversation className="flex-1">
        <ConversationContent className="mx-auto w-full max-w-3xl">
          {isLoading && <p className="py-10 text-center text-sm text-muted-foreground">Loading conversation…</p>}

          {!isLoading && messages.length === 0 && (
            <div className="py-12 text-center">
              <h2 className="font-serif text-2xl font-semibold">Ask about your institution</h2>
              <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
                The assistant reads live records you already have access to — enrollment, fees, attendance,
                admissions and results.
              </p>
              <div className="mx-auto mt-6 grid max-w-xl gap-2 sm:grid-cols-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => handleSend(s)}
                    className="rounded-sm border px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m) => (
            <Message from={m.role} key={m.id}>
              <MessageContent
                className={
                  m.role === "user"
                    ? "group-[.is-user]:bg-primary group-[.is-user]:text-primary-foreground"
                    : undefined
                }
              >
                <MessageParts message={m} />
              </MessageContent>
            </Message>
          ))}

          {status === "submitted" && (
            <div className="px-2 py-3">
              <Shimmer>Thinking…</Shimmer>
            </div>
          )}

          {error && (
            <p className="px-2 py-3 text-sm text-destructive">
              {error.message || "Something went wrong talking to the assistant."}
            </p>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="mx-auto w-full max-w-3xl p-4">
        <PromptInput
          onSubmit={(_message, event) => {
            event.preventDefault();
            void handleSend(input);
          }}
        >
          <PromptInputTextarea
            ref={textareaRef}
            value={input}
            autoFocus
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              voice.state === "recording"
                ? "Listening… speak your question, then tap the mic to send."
                : "Ask about students, fees, attendance, admissions… or use the mic"
            }
          />
          <PromptInputFooter className="justify-between">
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant={voice.state === "recording" ? "default" : "ghost"}
                size="icon"
                aria-label={voice.state === "recording" ? "Stop recording and send" : "Ask by voice"}
                title={voice.state === "recording" ? "Stop recording and send" : "Ask by voice"}
                disabled={busy || voice.state === "transcribing"}
                onClick={() => void voice.toggle()}
              >
                {voice.state === "transcribing" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : voice.state === "recording" ? (
                  <Square className="h-4 w-4" />
                ) : (
                  <Mic className="h-4 w-4" />
                )}
              </Button>
              {voice.state === "recording" && (
                <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-destructive" />
                  Listening…
                </span>
              )}
              {voice.state === "transcribing" && (
                <span className="text-xs text-muted-foreground">Transcribing…</span>
              )}
            </div>
            <PromptInputSubmit status={status} disabled={busy || !input.trim()} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}

export function AssistantLayout({ threadId, children }: { threadId: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex h-[calc(100vh-10rem)] min-h-[32rem] overflow-hidden rounded-sm border">
      <aside className="hidden w-64 shrink-0 border-r md:block">
        <ThreadList activeId={threadId} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="border-b p-2 md:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="sm">
                <PanelLeft className="mr-2 h-4 w-4" /> Conversations
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <SheetTitle className="sr-only">Conversations</SheetTitle>
              <ThreadList activeId={threadId} onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
        </div>
        {children}
      </div>
    </div>
  );
}
