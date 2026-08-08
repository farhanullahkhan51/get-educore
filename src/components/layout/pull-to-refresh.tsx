import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";

const THRESHOLD = 70;
const MAX_PULL = 110;

/** Mobile-only "drag to refresh": pull down at the top of the page to refetch data. */
export function PullToRefresh({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef<number | null>(null);
  const active = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const isTouch = window.matchMedia("(pointer: coarse)").matches;
    if (!isTouch) return;

    function onStart(e: TouchEvent) {
      if (refreshing) return;
      if (window.scrollY > 0) return;
      startY.current = e.touches[0]?.clientY ?? null;
      active.current = true;
    }

    function onMove(e: TouchEvent) {
      if (!active.current || startY.current === null) return;
      const y = e.touches[0]?.clientY ?? 0;
      const delta = y - startY.current;
      if (delta <= 0 || window.scrollY > 0) {
        setPull(0);
        active.current = false;
        return;
      }
      // resistance curve
      setPull(Math.min(MAX_PULL, delta * 0.5));
    }

    async function onEnd() {
      if (!active.current) return;
      active.current = false;
      startY.current = null;
      setPull((current) => {
        if (current >= THRESHOLD) {
          setRefreshing(true);
          void (async () => {
            try {
              await Promise.all([
                queryClient.refetchQueries({ type: "active" }),
                router.invalidate(),
              ]);
            } finally {
              setRefreshing(false);
              setPull(0);
            }
          })();
          return THRESHOLD;
        }
        return 0;
      });
    }

    window.addEventListener("touchstart", onStart, { passive: true });
    window.addEventListener("touchmove", onMove, { passive: true });
    window.addEventListener("touchend", onEnd, { passive: true });
    window.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onStart);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onEnd);
      window.removeEventListener("touchcancel", onEnd);
    };
  }, [queryClient, router, refreshing]);

  const offset = refreshing ? THRESHOLD : pull;
  const ready = pull >= THRESHOLD;

  return (
    <div className="relative">
      <div
        className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center overflow-hidden md:hidden"
        style={{ height: offset }}
        aria-hidden={offset === 0}
      >
        <div className="mt-2 flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-xs text-muted-foreground shadow-sm">
          <RefreshCw
            className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
            style={{ transform: refreshing ? undefined : `rotate(${pull * 3}deg)` }}
          />
          {refreshing ? "Refreshing…" : ready ? "Release to refresh" : "Pull to refresh"}
        </div>
      </div>
      <div
        style={{ transform: offset ? `translateY(${offset}px)` : undefined }}
        className={offset ? "" : "transition-transform duration-200"}
      >
        {children}
      </div>
    </div>
  );
}
