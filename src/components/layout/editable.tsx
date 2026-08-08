import { useCallback, useRef, useState, type ReactNode } from "react";
import { Eye, EyeOff, Pencil, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSurfaceLayout } from "@/lib/ui-layouts";
import { type ResolvedBlock } from "@/lib/ui-surfaces";

const SPAN_CLASS: Record<number, string> = {
  3: "md:col-span-6 lg:col-span-3",
  4: "md:col-span-6 lg:col-span-4",
  6: "md:col-span-12 lg:col-span-6",
  12: "col-span-12",
};

/** Pointer-driven reordering shared by every editable surface. */
function useReorder(
  container: React.RefObject<HTMLElement | null>,
  ids: string[],
  move: (id: string, to: number) => void,
) {
  const [dragging, setDragging] = useState<string | null>(null);
  const overRef = useRef<string | null>(null);
  const raf = useRef<number | null>(null);

  const stopScroll = () => {
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = null;
  };

  const start = useCallback(
    (id: string) => (e: React.PointerEvent) => {
      e.preventDefault();
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      setDragging(id);
      let clientY = e.clientY;

      const autoScroll = () => {
        const margin = 90;
        if (clientY < margin) window.scrollBy(0, -14);
        else if (clientY > window.innerHeight - margin) window.scrollBy(0, 14);
        raf.current = requestAnimationFrame(autoScroll);
      };
      raf.current = requestAnimationFrame(autoScroll);

      const onMove = (ev: PointerEvent) => {
        clientY = ev.clientY;
        const root = container.current;
        if (!root) return;
        let best: { id: string; dist: number } | null = null;
        for (const el of Array.from(root.querySelectorAll<HTMLElement>("[data-block-id]"))) {
          const targetId = el.dataset["blockId"]!;
          const r = el.getBoundingClientRect();
          const dx = Math.max(r.left - ev.clientX, 0, ev.clientX - r.right);
          const dy = Math.max(r.top - ev.clientY, 0, ev.clientY - r.bottom);
          const dist = Math.hypot(dx, dy);
          if (!best || dist < best.dist) best = { id: targetId, dist };
        }
        if (best && best.dist < 120 && best.id !== overRef.current) {
          overRef.current = best.id;
          const to = ids.indexOf(best.id);
          if (to !== -1) move(id, to);
        }
      };

      const onUp = () => {
        stopScroll();
        overRef.current = null;
        setDragging(null);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
      };

      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
    },
    [container, ids, move],
  );

  return { dragging, start };
}

function RenameField({ block, onRename }: { block: ResolvedBlock; onRename: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(block.label);
  if (!open)
    return (
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        title="Rename"
        onClick={() => {
          setValue(block.label);
          setOpen(true);
        }}
      >
        <Pencil className="h-3 w-3" />
      </Button>
    );
  return (
    <span className="flex items-center gap-1">
      <Input
        value={value}
        autoFocus
        onChange={(e) => setValue(e.target.value)}
        className="h-6 w-32 text-xs"
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            onRename(value);
            setOpen(false);
          }
          if (e.key === "Escape") setOpen(false);
        }}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={() => {
          onRename(value);
          setOpen(false);
        }}
      >
        <Check className="h-3 w-3" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={() => setOpen(false)}
      >
        <X className="h-3 w-3" />
      </Button>
    </span>
  );
}

type BlockChrome = {
  block: ResolvedBlock;
  dragging: boolean;
  onToggleHidden: () => void;
  onRename: (v: string) => void;
};

function EditChrome({
  block,
  onToggleHidden,
  onRename,
}: BlockChrome) {
  return (
    <div
      data-block-chrome
      className="pointer-events-auto absolute -top-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-1 rounded-full border border-border/60 bg-card px-2.5 py-1 text-xs shadow-md"
    >
      <span className="min-w-0 max-w-28 truncate font-medium">{block.label}</span>

      {block.canRename !== false && <RenameField block={block} onRename={onRename} />}

      {block.canHide !== false && (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          title={block.hidden ? "Show" : "Hide"}
          onClick={onToggleHidden}
        >
          {block.hidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
        </Button>
      )}
    </div>
  );
}

/**
 * A 12-column grid whose blocks admins can drag, resize, hide and rename.
 * `render` maps a block id to its content; ids with no content are skipped.
 */
export function EditableGrid({
  scope,
  render,
  className,
}: {
  scope: string;
  render: (block: ResolvedBlock) => ReactNode;
  className?: string;
}) {
  const { blocks, editing, move, toggleHidden, rename } = useSurfaceLayout(scope);
  const ref = useRef<HTMLDivElement>(null);
  const shown = editing ? blocks : blocks.filter((b) => !b.hidden);
  const { dragging, start } = useReorder(
    ref,
    blocks.map((b) => b.id),
    move,
  );

  return (
    <div ref={ref} className={cn("grid grid-cols-12 gap-4", className)}>
      {shown.map((block, i) => {
        const content = render(block);
        if (content === null || content === undefined) return null;
        return (
          <div
            key={block.id}
            data-block-id={block.id}
            onPointerDown={
              editing
                ? (e) => {
                    // Drag from anywhere on the card, except its edit controls.
                    if ((e.target as HTMLElement).closest("[data-block-chrome]")) return;
                    start(block.id)(e);
                  }
                : undefined
            }
            onClickCapture={
              editing
                ? (e) => {
                    // While editing, cards are handles — never follow their links.
                    if ((e.target as HTMLElement).closest("[data-block-chrome]")) return;
                    e.preventDefault();
                    e.stopPropagation();
                  }
                : undefined
            }
            className={cn(
              SPAN_CLASS[block.span] ?? SPAN_CLASS[3],
              "col-span-12",
              block.height === "tall" && "row-span-2",
              editing && "cursor-grab touch-none rounded-3xl border border-dashed border-primary/50 bg-muted/30 p-2 shadow-sm [&>div>*]:overflow-hidden [&>div>*]:rounded-2xl active:cursor-grabbing",
              editing && block.hidden && "opacity-45",
              editing && (i % 2 === 0 ? "animate-wiggle" : "animate-wiggle-alt"),
              dragging === block.id && "ring-2 ring-primary wiggle-paused",
            )}
          >
            {editing && (
              <EditChrome
                block={block}
                dragging={dragging === block.id}
                onDragStart={start(block.id)}
                onToggleHidden={() => toggleHidden(block.id)}
                onRename={(v) => rename(block.id, v)}
              />
            )}
            <div className={cn(block.height === "tall" && "h-full")}>{content}</div>
          </div>
        );
      })}
    </div>
  );
}

/**
 * A vertical list (sidebar navigation) whose entries admins can drag, hide and rename.
 * `render` receives the resolved block; return null to omit an entry (e.g. role filtering).
 */
export function EditableList({
  scope,
  render,
  className,
}: {
  scope: string;
  render: (block: ResolvedBlock) => ReactNode;
  className?: string;
}) {
  const { blocks, editing, move, toggleHidden, rename } = useSurfaceLayout(scope);
  const ref = useRef<HTMLDivElement>(null);
  const shown = editing ? blocks : blocks.filter((b) => !b.hidden);
  const { dragging, start } = useReorder(
    ref,
    blocks.map((b) => b.id),
    move,
  );

  return (
    <div ref={ref} className={className}>
      {shown.map((block, i) => {
        const content = render(block);
        if (content === null || content === undefined) return null;
        return (
          <div
            key={block.id}
            data-block-id={block.id}
            onPointerDown={
              editing
                ? (e) => {
                    if ((e.target as HTMLElement).closest("[data-block-chrome]")) return;
                    start(block.id)(e);
                  }
                : undefined
            }
            onClickCapture={
              editing
                ? (e) => {
                    if ((e.target as HTMLElement).closest("[data-block-chrome]")) return;
                    e.preventDefault();
                    e.stopPropagation();
                  }
                : undefined
            }
            className={cn(
              "relative",
              editing &&
                "my-1 cursor-grab touch-none rounded-2xl border border-dashed border-primary/40 bg-muted/40 px-1 py-0.5 shadow-sm [&>a]:rounded-xl [&>button]:rounded-xl active:cursor-grabbing",
              editing && block.hidden && "opacity-45",
              editing && (i % 2 === 0 ? "animate-wiggle" : "animate-wiggle-alt"),
              dragging === block.id && "ring-2 ring-primary wiggle-paused",
            )}
          >
            {content}
            {editing && (
              <div
                data-block-chrome
                className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center gap-0.5"
              >

                <RenameField block={block} onRename={(v) => rename(block.id, v)} />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  title={block.hidden ? "Show" : "Hide"}
                  onClick={() => toggleHidden(block.id)}
                >
                  {block.hidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/**
 * A tab strip whose tabs admins can reorder, hide and rename.
 * Tab content stays where it is — hidden tabs simply have no trigger.
 */
export function EditableTabsList({ scope, className }: { scope: string; className?: string }) {
  const { blocks, editing, move, toggleHidden, rename } = useSurfaceLayout(scope);
  const ref = useRef<HTMLDivElement>(null);
  const shown = editing ? blocks : blocks.filter((b) => !b.hidden);
  const { dragging, start } = useReorder(
    ref,
    blocks.map((b) => b.id),
    move,
  );

  return (
    <div ref={ref} className={cn("mb-4 flex flex-wrap items-center gap-2", className)}>
      <TabsList>
        {shown.map((block, i) => (
          <TabsTrigger
            key={block.id}
            value={block.id}
            data-block-id={block.id}
            onPointerDown={editing ? start(block.id) : undefined}
            className={cn(
              editing &&
                "cursor-grab touch-none rounded-full border border-dashed border-primary/50 active:cursor-grabbing",
              editing && block.hidden && "opacity-45",
              editing && (i % 2 === 0 ? "animate-wiggle" : "animate-wiggle-alt"),
              dragging === block.id && "ring-2 ring-primary wiggle-paused",
            )}
          >
            {block.label}
          </TabsTrigger>

        ))}
      </TabsList>
      {editing && (
        <div className="flex flex-wrap items-center gap-1 rounded-sm bg-muted/70 px-2 py-1 text-xs">
          {blocks.map((block) => (
            <span
              key={block.id}
              className="flex items-center gap-0.5 rounded-sm bg-background px-1"
            >
              <span className="max-w-24 truncate">{block.label}</span>
              <RenameField block={block} onRename={(v) => rename(block.id, v)} />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                title={block.hidden ? "Show tab" : "Hide tab"}
                onClick={() => toggleHidden(block.id)}
              >
                {block.hidden ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              </Button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

/** The tab a page should open on, respecting hidden tabs. */
export function useFirstVisibleTab(scope: string, preferred?: string) {
  const { visible } = useSurfaceLayout(scope);
  if (preferred && visible.some((b) => b.id === preferred)) return preferred;
  return visible[0]?.id ?? preferred ?? "";
}

/**
 * Drop-in replacement for `<Tabs defaultValue>` that renders an editable tab strip.
 * Children stay as ordinary `<TabsContent>` elements.
 */
export function EditableTabs({
  scope,
  fallback,
  className,
  listClassName,
  children,
}: {
  scope: string;
  fallback: string;
  className?: string;
  listClassName?: string;
  children: ReactNode;
}) {
  const { visible } = useSurfaceLayout(scope);
  const [value, setValue] = useState(fallback);
  const active = visible.some((b) => b.id === value) ? value : (visible[0]?.id ?? fallback);

  return (
    <Tabs value={active} onValueChange={setValue} className={className}>
      <EditableTabsList scope={scope} className={listClassName} />
      {children}
    </Tabs>
  );
}
