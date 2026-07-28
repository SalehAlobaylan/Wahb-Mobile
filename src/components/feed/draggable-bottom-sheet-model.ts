export type BottomSheetSnap = 'collapsed' | 'midpoint' | 'expanded';

/** Pods needs one compact action row below its handle. */
export const collapsedSheetBaseHeight = 64;
/** News has no collapsed actions: retain only the visible pull handle. */
export const newsCollapsedSheetBaseHeight = 36;
export const expandedSheetContentHeight = 440;

export function sheetSnapPoints(
  viewportHeight: number,
  topInset: number,
  bottomInset: number,
  collapsedBaseHeight = collapsedSheetBaseHeight,
) {
  const collapsed = collapsedBaseHeight + bottomInset;
  const expanded = Math.max(
    collapsed,
    Math.min(
      expandedSheetContentHeight + bottomInset,
      viewportHeight - topInset - 56,
    ),
  );
  return {
    collapsed,
    midpoint: Math.round((collapsed + expanded) / 2),
    expanded,
  };
}

export function nearestSheetSnap(
  value: number,
  points: ReturnType<typeof sheetSnapPoints>,
): BottomSheetSnap {
  const entries = Object.entries(points) as [BottomSheetSnap, number][];
  return entries.reduce((closest, entry) =>
    Math.abs(entry[1] - value) < Math.abs(closest[1] - value) ? entry : closest,
  )[0];
}
