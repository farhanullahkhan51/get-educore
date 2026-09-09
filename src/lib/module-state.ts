import { useCallback, useState } from "react";

/**
 * Per-module screen state (search text, open tab, …) kept for the session so
 * leaving a module and coming back shows exactly what you left behind.
 * Deliberately in memory + sessionStorage only — never touches saved records.
 */
const memory = new Map<string, unknown>();

function read<T>(key: string, fallback: T): T {
  if (memory.has(key)) return memory.get(key) as T;
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.sessionStorage.getItem(`educore.view.${key}`);
    if (raw === null) return fallback;
    const parsed = JSON.parse(raw) as T;
    memory.set(key, parsed);
    return parsed;
  } catch {
    return fallback;
  }
}

export function useModuleState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => read(key, initial));

  const set = useCallback(
    (next: T) => {
      setValue(next);
      memory.set(key, next);
      if (typeof window !== "undefined") {
        try {
          window.sessionStorage.setItem(`educore.view.${key}`, JSON.stringify(next));
        } catch {
          /* storage full or blocked — in-memory copy still works */
        }
      }
    },
    [key],
  );

  return [value, set] as const;
}
