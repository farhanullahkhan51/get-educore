/** Airbnb-style floating segmented filter for campus scope. */
export function CampusPills({ value, onChange, campuses }: {
  value: string; onChange: (v: string) => void; campuses: Array<{ id: string; name: string }>;
}) {
  const opts = [{ id: "all", name: "All campuses" }, ...campuses];
  return (
    <div role="radiogroup" aria-label="Campus" className="glass-panel sticky top-2 z-10 mb-6 inline-flex max-w-full gap-1 overflow-x-auto rounded-full p-1">
      {opts.map((c) => {
        const on = value === c.id;
        return (
          <button key={c.id} type="button" role="radio" aria-checked={on} onClick={() => onChange(c.id)}
            className={"press whitespace-nowrap rounded-full px-4 py-1.5 text-sm transition-colors duration-300 " + (on ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-accent hover:text-foreground")}>
            {c.name}
          </button>
        );
      })}
    </div>
  );
}
