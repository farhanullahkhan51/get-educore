import { useBlocker } from "@tanstack/react-router";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * Warns before leaving a screen with unsaved form input, so switching modules
 * can never quietly throw away what someone typed.
 */
export function UnsavedGuard({ when }: { when: boolean }) {
  const { status, proceed, reset } = useBlocker({
    shouldBlockFn: () => when,
    enableBeforeUnload: when,
    withResolver: true,
  });

  return (
    <AlertDialog open={status === "blocked"} onOpenChange={(o) => !o && reset?.()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Leave without saving?</AlertDialogTitle>
          <AlertDialogDescription>
            You have changes that haven't been saved yet. If you leave now they will be lost.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => reset?.()}>Stay on this page</AlertDialogCancel>
          <AlertDialogAction onClick={() => proceed?.()}>Discard changes</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
