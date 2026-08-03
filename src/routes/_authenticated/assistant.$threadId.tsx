import { createFileRoute } from "@tanstack/react-router";
import { AssistantLayout, ChatWorkspace } from "@/components/assistant/chat-workspace";
import { PageHeader } from "@/components/layout/page-header";

export const Route = createFileRoute("/_authenticated/assistant/$threadId")({
  head: () => ({
    meta: [
      { title: "AI Assistant | EduCore ERP" },
      {
        name: "description",
        content:
          "Ask the EduCore AI Assistant about enrollment, fees, attendance, admissions and results using live institutional data.",
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
  component: AssistantThreadPage,
});

function AssistantThreadPage() {
  const { threadId } = Route.useParams();
  return (
    <>
      <PageHeader
        eyebrow="ASSISTANT"
        title="AI Assistant"
        description="Ask questions in plain language. The assistant reads only the records your role and campus allow."
      />
      <AssistantLayout threadId={threadId}>
        <ChatWorkspace key={threadId} threadId={threadId} />
      </AssistantLayout>
    </>
  );
}
