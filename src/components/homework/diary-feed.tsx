import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { BookOpen } from "lucide-react";
import { DUE_LABEL, HOMEWORK_KINDS, addDays, dueState, localToday } from "@/lib/homework";
import { cn } from "@/lib/utils";

/** Student-facing diary: today's entries plus anything still due. */
export function DiaryFeed({ sectionId }: { sectionId: string }) {
  const today = localToday();
  const { data = [], isLoading } = useQuery({
    queryKey: ["portal-diary", sectionId, today],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("homework_entries")
        .select("id,subject,kind,title,details,assigned_on,due_on,attachment_url")
        .eq("section_id", sectionId)
        .gte("assigned_on", addDays(today, -14))
        .order("assigned_on", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data;
    },
  });
  const rows = data.filter((r) => r.assigned_on === today || (r.due_on && r.due_on >= addDays(today, -3)));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <BookOpen className="h-4 w-4" /> Daily diary & homework
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No homework posted for your section right now.</p>
        ) : (
          rows.map((r) => {
            const s = dueState(r.due_on, today);
            return (
              <div key={r.id} className="rounded-md border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{r.subject || "General"}</span>
                  <Badge variant="outline">{HOMEWORK_KINDS.find((k) => k.v === r.kind)?.l ?? r.kind}</Badge>
                  {s !== "none" && (
                    <Badge
                      variant={s === "overdue" ? "destructive" : "secondary"}
                      className={cn(s === "today" && "bg-primary text-primary-foreground")}
                    >
                      {DUE_LABEL[s]} · {r.due_on}
                    </Badge>
                  )}
                </div>
                <p className="mt-1 text-sm font-medium">{r.title}</p>
                {r.details && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{r.details}</p>}
                {r.attachment_url && (
                  <a href={r.attachment_url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-sm text-primary underline">
                    Open worksheet
                  </a>
                )}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}
