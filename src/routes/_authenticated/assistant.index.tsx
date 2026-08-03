import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

import { PageHeader } from "@/components/layout/page-header";
import { useCurrentUser } from "@/hooks/use-current-user";
import { useTenantId } from "@/lib/tenant-context";
import { createThread, listThreads } from "@/lib/ai-threads";

export const Route = createFileRoute("/_authenticated/assistant/")({
  head: () => ({
    meta: [
      { title: "AI Assistant | EduCore ERP" },
      {
        name: "description",
        content:
          "Start a conversation with the EduCore AI Assistant to explore enrollment, fees, attendance and admissions data.",
      },
      { property: "og:title", content: "AI Assistant | EduCore ERP" },
      {
        property: "og:description",
        content: "Conversational analytics over your live school and college records.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AssistantIndexPage,
});

function AssistantIndexPage() {
  const navigate = useNavigate();
  const { data: user } = useCurrentUser();
  const tenantId = useTenantId();
  const startedRef = useRef(false);

  const { data: threads, isLoading } = useQuery({ queryKey: ["ai-threads"], queryFn: listThreads });

  useEffect(() => {
    if (isLoading || !user || startedRef.current) return;
    startedRef.current = true;

    const newest = threads?.[0];
    if (newest) {
      navigate({ to: "/assistant/$threadId", params: { threadId: newest.id }, replace: true });
      return;
    }

    createThread(user.userId, tenantId)
      .then((thread) =>
        navigate({ to: "/assistant/$threadId", params: { threadId: thread.id }, replace: true }),
      )
      .catch((e: Error) => {
        startedRef.current = false;
        toast.error(e.message);
      });
  }, [isLoading, threads, user, tenantId, navigate]);

  return (
    <>
      <PageHeader
        eyebrow="ASSISTANT"
        title="AI Assistant"
        description="Ask questions in plain language about your institution's live data."
      />
      <p className="text-sm text-muted-foreground">Opening your conversation…</p>
    </>
  );
}
