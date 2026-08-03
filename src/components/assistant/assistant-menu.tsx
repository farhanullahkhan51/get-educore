import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Bot } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useTenantId } from "@/lib/tenant-context";
import { createThread, listThreads } from "@/lib/ai-threads";
import { ChatWorkspace } from "@/components/assistant/chat-workspace";

export function AssistantMenu() {
  const [open, setOpen] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const { data: user } = useCurrentUser();
  const tenantId = useTenantId();

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
          <div className="flex items-center gap-2 border-b px-4 py-3">
            <Bot className="h-4 w-4 text-primary" />
            <span className="font-serif text-sm font-semibold">AI Assistant</span>
          </div>
          <div className="h-[28rem]">
            {threadId ? (
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
