import { useRouterState } from "@tanstack/react-router";
import { useIsFetching } from "@tanstack/react-query";
import { useEffect, useState } from "react";

/**
 * Thin top progress line shown while the next screen (or its data) is loading,
 * so switching modules always feels responsive.
 */
export function RouteProgress() {
  const routerPending = useRouterState({ select: (s) => s.status === "pending" });
  const fetching = useIsFetching();
  const active = routerPending || fetching > 0;
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (active) {
      const show = setTimeout(() => setVisible(true), 120);
      return () => clearTimeout(show);
    }
    const hide = setTimeout(() => setVisible(false), 200);
    return () => clearTimeout(hide);
  }, [active]);

  if (!visible) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5 overflow-hidden bg-transparent"
    >
      <div className="h-full w-1/3 animate-[route-progress_1.1s_ease-in-out_infinite] bg-primary" />
    </div>
  );
}
