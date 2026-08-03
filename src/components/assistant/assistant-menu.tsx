import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bot, History, MessageSquare, Plus, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useTenantId } from "@/lib/tenant-context";
import { createThread, deleteThread, listThreads } from "@/lib/ai-threads";
import { ChatWorkspace } from "@/components/assistant/chat-workspace";
import { cn } from "@/lib/utils";

export function AssistantMenu() {
  const [open, setOpen] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const { data: user } = useCurrentUser();
  const tenantId = useTenantId();
  const queryClient = useQueryClient();

  const { data: threads, isLoading } = useQuery({
    queryKey: ["ai-threads"],
    queryFn: listThreads,
    enabled: open,
  });

  useEffect(() => {
    if (!open || !user || threadId || isLoading || creating) return;
    const newest = threads?.[0];
    if (newest) {
      setThreadId(newest.id);
      return;
    }
    setCreating(true);
    createThread(user.userId, tenantId)
      .then((thread) => setThreadId(thread.id))
      .catch((e: Error) => toast.error(e.message))
      .finally(() => setCreating(false));
  }, [open, user, threadId, threads, isLoading, creating, tenantId]);

  const newChat = useMutation({
    mutationFn: async () => createThread(user!.userId, tenantId),
    onSuccess: (thread) => {
      queryClient.invalidateQueries({ queryKey: ["ai-threads"] });
      setThreadId(thread.id);
      setShowHistory(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: deleteThread,
    onSuccess: (_data, id) => {
      queryClient.invalidateQueries({ queryKey: ["ai-threads"] });
      if (id === threadId) setThreadId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <TooltipProvider delayDuration={150}>
      <Popover open={open} onOpenChange={setOpen}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="AI Assistant">
                <Bot className="h-5 w-5" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom">Hey there, How can I help?</TooltipContent>
        </Tooltip>
        <PopoverContent
          align="end"
          sideOffset={8}
          className="w-[min(26rem,calc(100vw-2rem))] p-0 overflow-hidden"
        >
          <div className="flex items-center gap-2 border-b px-4 py-2.5">
            <Bot className="h-4 w-4 text-primary" />
            <span className="font-serif text-sm font-semibold">AI Assistant</span>
            <div className="ml-auto flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={showHistory ? "Close past conversations" : "Past conversations"}
                title={showHistory ? "Close past conversations" : "Past conversations"}
                onClick={() => setShowHistory((v) => !v)}
              >
                {showHistory ? <X className="h-4 w-4" /> : <History className="h-4 w-4" />}
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label="New conversation"
                title="New conversation"
                disabled={!user || newChat.isPending}
                onClick={() => newChat.mutate()}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="h-[28rem]">
            {showHistory ? (
              <div className="h-full space-y-1 overflow-y-auto p-2">
                {(threads ?? []).map((t) => (
                  <div
                    key={t.id}
                    className={cn(
                      "group flex items-center gap-1 rounded-sm px-1 transition-colors",
                      t.id === threadId ? "bg-muted" : "hover:bg-muted/60",
                    )}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setThreadId(t.id);
                        setShowHistory(false);
                      }}
                      className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left text-sm"
                    >
                      <MessageSquare className="h-3.5 w-3.5 shrink-0 opacity-60" />
                      <span className="truncate">{t.title}</span>
                      <span className="ml-auto shrink-0 text-[11px] text-muted-foreground">
                        {new Date(t.updated_at).toLocaleDateString()}
                      </span>
                    </button>
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
                {!isLoading && threads?.length === 0 && (
                  <p className="px-3 py-6 text-xs text-muted-foreground">
                    No past conversations yet.
                  </p>
                )}
              </div>
            ) : threadId ? (
              <ChatWorkspace key={threadId} threadId={threadId} />
            ) : (
              <p className="p-6 text-sm text-muted-foreground">Opening your conversation…</p>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </TooltipProvider>
  );
}

