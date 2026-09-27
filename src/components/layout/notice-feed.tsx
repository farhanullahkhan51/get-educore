import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Megaphone, Pin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

type FeedNotice = {
  id: string;
  reference_no: string;
  title: string;
  content: string;
  category: string;
  priority: string;
  is_pinned: boolean;
  published_at: string;
  issued_by: string;
};

function priorityClass(p: string) {
  if (p === "critical") return "border-transparent bg-destructive/10 text-destructive";
  if (p === "urgent") return "border-transparent bg-amber-500/15 text-amber-700 dark:text-amber-400";
  return "border-transparent bg-muted text-muted-foreground";
}

/**
 * Compact notice board feed shown on the dashboard and the student portal.
 * Row-level rules already limit which circulars each signed-in user can read.
 */
export function NoticeFeed({
  limit = 4,
  showLink = true,
  title = "Notice Board",
}: {
  limit?: number;
  showLink?: boolean;
  title?: string;
}) {
  const { data, isLoading } = useQuery({
    queryKey: ["notice-feed", limit],
    queryFn: async () => {
      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .from("notices")
        .select("id, reference_no, title, content, category, priority, is_pinned, published_at, issued_by")
        .eq("is_published", true)
        .lte("published_at", nowIso)
        .or(`expires_at.is.null,expires_at.gt.${nowIso}`)
        .order("is_pinned", { ascending: false })
        .order("published_at", { ascending: false })
        .limit(limit);
      if (error) throw error;
      return data as FeedNotice[];
    },
  });

  if (isLoading) return null;
  if (!data || data.length === 0) return null;

  return (
    <Card className="shadow-none">
      <CardContent className="space-y-4 p-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Megaphone className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-serif text-base font-semibold">{title}</h2>
          </div>
          {showLink && (
            <Link to="/notices" className="text-xs text-muted-foreground underline-offset-4 hover:underline">
              View all
            </Link>
          )}
        </div>
        <ul className="space-y-3">
          {data.map((n) => (
            <li key={n.id} className="border-b border-border pb-3 last:border-0 last:pb-0">
              <div className="flex flex-wrap items-center gap-2">
                {n.is_pinned && <Pin className="h-3 w-3 text-primary" />}
                <span className="text-sm font-medium">{n.title}</span>
                {n.priority !== "normal" && (
                  <Badge variant="outline" className={cn("text-[10px]", priorityClass(n.priority))}>
                    {n.priority === "critical" ? "Critical" : "Urgent"}
                  </Badge>
                )}
              </div>
              {n.content && (
                <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{n.content}</p>
              )}
              <p className="mt-1 text-[11px] text-muted-foreground">
                {n.reference_no} · {new Date(n.published_at).toLocaleDateString()} · {n.issued_by}
              </p>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
