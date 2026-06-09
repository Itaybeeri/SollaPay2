// Tiny synchronous pub/sub. Handlers run in registration order, in-process.
// All side-effects (audit, notifications) react to events instead of being
// called directly by business logic.
type Handler = (payload: unknown) => void;

const handlers = new Map<string, Handler[]>();

export const eventBus = {
  on(event: string, handler: Handler): void {
    const list = handlers.get(event) ?? [];
    list.push(handler);
    handlers.set(event, list);
  },
  emit(event: string, payload: unknown): void {
    for (const handler of handlers.get(event) ?? []) handler(payload);
  },
};
