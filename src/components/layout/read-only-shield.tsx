import { useEffect } from "react";
import { toast } from "sonner";
import { useBilling } from "@/lib/billing";

/** Verbs that indicate a create / edit / delete action. */
const WRITE_WORDS =
  /\b(add|new|create|save|update|edit|delete|remove|issue|generate|grant|record|publish|submit|import|convert|revoke|assign|approve|enrol|enroll|register|mark)\b/i;

/**
 * When the institution's trial has ended (or the subscription is cancelled /
 * suspended), stop create-edit-delete clicks before they reach the form and
 * explain why. The database enforces the same rule; this only makes the
 * failure friendly. Reading, printing and exporting stay untouched.
 */
export function ReadOnlyShield() {
  const { readOnly } = useBilling();

  useEffect(() => {
    if (!readOnly) return;

    const onClick = (event: MouseEvent) => {
      const el = event.target as HTMLElement | null;
      const control = el?.closest?.("button, [role='button']") as HTMLElement | null;
      if (!control) return;

      // Never block the way out: billing page, trial banner, dialogs' close buttons.
      if (control.closest("[data-allow-readonly]")) return;
      if (window.location.pathname.startsWith("/billing")) return;

      const label = `${control.textContent ?? ""} ${control.getAttribute("aria-label") ?? ""} ${control.getAttribute("title") ?? ""}`;
      if (!WRITE_WORDS.test(label)) return;

      event.preventDefault();
      event.stopPropagation();
      toast.error("Your trial has ended", {
        description: "Your data is safe and viewable. Choose a plan to add or change records.",
        action: { label: "Choose a plan", onClick: () => (window.location.href = "/billing") },
      });
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [readOnly]);

  return null;
}
