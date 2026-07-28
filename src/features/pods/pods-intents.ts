export type PodsIntent =
  | 'toggle-playback'
  | 'previous-item'
  | 'next-item'
  | 'open-comments'
  | 'open-about'
  | 'open-overflow';

export type PodsIntentHandlers = Record<PodsIntent, () => void>;

/** Visual surfaces emit named intents; the screen controller owns outcomes. */
export function createPodsIntentDispatcher(
  handlers: PodsIntentHandlers,
): (intent: PodsIntent) => void {
  return (intent) => handlers[intent]();
}
