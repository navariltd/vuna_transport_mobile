// Fullscreen map state stays in memory: never put stops, route geometry or
// callbacks in navigation URLs, disk storage or the offline outbox.
export function createMapHandoff<T>() {
  let sequence = 0;
  let current: { id: string; owner: string; payload: T } | null = null;
  const listeners = new Set<() => void>();
  const notify = () => { for (const listener of listeners) listener(); };
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    getSnapshot: () => current,
    open(owner: string, payload: T) {
      const id = String(++sequence);
      current = { id, owner, payload }; notify(); return id;
    },
    update(owner: string, payload: T) {
      if (current?.owner !== owner) return;
      current = { ...current, payload }; notify();
    },
    clearOwner(owner: string) {
      if (current?.owner === owner) { current = null; notify(); }
    },
    clearId(id: string) {
      if (current?.id === id) { current = null; notify(); }
    },
  };
}
