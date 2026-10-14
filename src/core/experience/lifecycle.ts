let foreground = true;
const listeners = new Set<() => void>();
export const isForeground = () => foreground;
export function subscribeForeground(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
export function setExperienceForeground(value: boolean) {
  if (foreground === value) return;
  foreground = value;
  for (const listener of [...listeners]) listener();
}

let surface: 'pods' | 'news' = 'pods';
export const setExperienceSurface = (value: 'pods' | 'news') => {
  surface = value;
};
export const getExperienceSurface = () => surface;

const seekListeners = new Set<() => void>();
export function subscribeIntentionalSeek(listener: () => void) {
  seekListeners.add(listener);
  return () => {
    seekListeners.delete(listener);
  };
}
export function notifyIntentionalSeek() {
  for (const listener of [...seekListeners]) listener();
}
