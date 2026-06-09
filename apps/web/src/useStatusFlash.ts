import { useEffect, useRef, useState } from "react";

// Returns the set of item ids whose status changed since the previous poll, so
// a row can briefly flash when it flips (e.g. Pending -> Matched). Each id is
// held for ~1s, then released.
export function useStatusFlash(items: { id: string; status: string }[]): Set<string> {
  const previous = useRef<Map<string, string>>(new Map());
  const [flashing, setFlashing] = useState<Set<string>>(new Set());

  useEffect(() => {
    const changed: string[] = [];
    for (const item of items) {
      const before = previous.current.get(item.id);
      if (before !== undefined && before !== item.status) changed.push(item.id);
      previous.current.set(item.id, item.status);
    }
    if (changed.length === 0) return;

    setFlashing((current) => new Set([...current, ...changed]));
    const timer = setTimeout(() => {
      setFlashing((current) => {
        const next = new Set(current);
        for (const id of changed) next.delete(id);
        return next;
      });
    }, 1000);
    return () => clearTimeout(timer);
  }, [items]);

  return flashing;
}
