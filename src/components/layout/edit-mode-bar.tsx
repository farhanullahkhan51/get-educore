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
      <Button variant="outline" size="sm" onClick={startEditing} title="Rearrange this interface">
        <Pencil className="mr-1 h-3.5 w-3.5" />
        Edit layout
      </Button>
    );

  return (
    <div className="flex items-center gap-1">
      <Button variant="ghost" size="sm" onClick={discard} disabled={saving}>
        <Undo2 className="mr-1 h-3.5 w-3.5" />
        Discard
      </Button>
      <Button
        size="sm"
        disabled={saving || !dirty}
        onClick={() =>
          save()
            .then(() => toast.success("Layout saved for everyone in your institution"))
            .catch((e: Error) => toast.error(e.message))
        }
      >
        <Save className="mr-1 h-3.5 w-3.5" />
        {saving ? "Saving…" : "Save layout"}
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
        <strong>Editing layout.</strong> Drag the handles to rearrange, use the icons to resize, rename or hide blocks.
        Changes apply to everyone once saved.
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
