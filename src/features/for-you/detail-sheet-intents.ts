export type DetailSheetIntent = 'close' | 'expand' | 'collapse' | null;

/** Keeps the visual gesture recognizer from deciding sheet behavior itself. */
export function detailSheetIntentForPan(
  verticalDistance: number,
  expanded: boolean,
): DetailSheetIntent {
  if (verticalDistance > 120) return 'close';
  if (verticalDistance < -50 && !expanded) return 'expand';
  if (verticalDistance > 50 && expanded) return 'collapse';
  return null;
}
