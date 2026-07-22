export type ForYouIntent =
  | 'toggle-playback'
  | 'previous-item'
  | 'next-item'
  | 'open-comments'
  | 'open-about'
  | 'open-overflow';

export type ForYouIntentHandlers = Record<ForYouIntent, () => void>;

/** Visual surfaces emit named intents; the screen controller owns outcomes. */
export function createForYouIntentDispatcher(
  handlers: ForYouIntentHandlers,
): (intent: ForYouIntent) => void {
  return (intent) => handlers[intent]();
}
