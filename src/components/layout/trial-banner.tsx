import { Link } from "@tanstack/react-router";
import { AlertTriangle, Clock } from "lucide-react";
import { useBilling } from "@/lib/billing";
import { Button } from "@/components/ui/button";

/** Slim trial / expiry strip shown across the app for institutions on trial. */
export function TrialBanner() {
  const { state, isTrial, daysLeft, readOnly, showUpgradeCta } = useBilling();
  if (!state) return null;

  if (readOnly) {
    return (
      <div className="flex flex-wrap items-center justify-center gap-3 border-b bg-destructive/10 px-4 py-2 text-xs text-destructive">
        <AlertTriangle className="h-3.5 w-3.5" />
        <span>
          Your trial has ended. Your data is safe, but new records cannot be added until a plan is
          active.
        </span>
        <Button asChild size="sm" variant="destructive" className="h-7">
          <Link to="/billing">Choose a plan</Link>
        </Button>
      </div>
    );
  }

  if (!isTrial || daysLeft == null) return null;

  return (
    <div className="flex flex-wrap items-center justify-center gap-3 border-b bg-accent/40 px-4 py-2 text-xs">
      <Clock className="h-3.5 w-3.5" />
      <span>
        {daysLeft === 0
          ? "Your free trial ends today."
          : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left in your free trial.`}
      </span>
      {showUpgradeCta && (
        <Button asChild size="sm" className="h-7">
          <Link to="/billing">Choose a plan</Link>
        </Button>
      )}
    </div>
  );
}
