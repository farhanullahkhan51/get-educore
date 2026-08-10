import { Pencil, Save, Undo2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useUiLayouts } from "@/lib/ui-layouts";

/** Header control: enters edit mode and, while editing, saves or discards. */
export function EditModeButton() {
  const { canEdit, editing, dirty, saving, startEditing, discard, save } = useUiLayouts();
  if (!canEdit) return null;

  if (!editing)
    return (
      <Pencil
        className="h-4 w-4 cursor-pointer text-muted-foreground hover:text-foreground transition-colors"
        onClick={startEditing}
        title="Rearrange this interface"
        aria-label="Edit layout"
      />
    );

  return (
    <div className="flex items-center gap-1">
      <Button
        variant="ghost"
        size="icon"
        onClick={discard}
        disabled={saving}
        title="Discard changes"
        aria-label="Discard changes"
      >
        <Undo2 className="h-4 w-4" />
      </Button>
      <Button
        size="icon"
        disabled={saving || !dirty}
        onClick={() =>
          save()
            .then(() => toast.success("Layout saved for everyone in your institution"))
            .catch((e: Error) => toast.error(e.message))
        }
        title={saving ? "Saving…" : "Save layout"}
        aria-label={saving ? "Saving…" : "Save layout"}
      >
        <Save className="h-4 w-4" />
      </Button>
    </div>
  );
}

/** Sticky banner shown while editing, with a full reset. */
export function EditModeBanner() {
  const { editing, saving, resetAll } = useUiLayouts();
  if (!editing) return null;
  return (
    <div className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-2 border-b border-primary/40 bg-primary/10 px-4 py-2 text-sm">
      <span>
        <strong>Editing layout.</strong> Drag the handles to rearrange, use the icons to resize,
        rename or hide blocks. Changes apply to everyone once saved.
      </span>
      <Button
        variant="outline"
        size="sm"
        disabled={saving}
        onClick={() =>
          resetAll()
            .then(() => toast.success("All layouts reset to default"))
            .catch((e: Error) => toast.error(e.message))
        }
      >
        <RotateCcw className="mr-1 h-3.5 w-3.5" />
        Reset everything
      </Button>
    </div>
  );
}
