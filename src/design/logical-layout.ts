/**
 * Returns React Native logical placement props. Screens can use this instead
 * of deciding whether an Arabic route should be manually reversed.
 */
export function logicalInset(
  edge: 'start' | 'end',
  value: number,
): { start: number } | { end: number } {
  return edge === 'start' ? { start: value } : { end: value };
}
