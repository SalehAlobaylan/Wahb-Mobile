export function newsPageLayout(pageHeight: number, index: number) {
  const length = Math.max(0, pageHeight);
  return {
    index,
    length,
    offset: length * index,
  };
}

export function newsPageIndex(
  offset: number,
  pageHeight: number,
  pageCount: number,
) {
  if (pageHeight <= 0 || pageCount <= 0) return 0;
  return Math.max(0, Math.min(pageCount - 1, Math.round(offset / pageHeight)));
}

export function newsPageOffset(index: number, pageHeight: number) {
  return Math.max(0, index) * Math.max(0, pageHeight);
}

export function reconcileNewsPageIndex(
  activeSlideId: string | null,
  slideIds: readonly string[],
  fallbackIndex: number,
) {
  if (!slideIds.length) return 0;
  if (activeSlideId) {
    const anchoredIndex = slideIds.indexOf(activeSlideId);
    if (anchoredIndex >= 0) return anchoredIndex;
  }
  return Math.max(0, Math.min(slideIds.length - 1, fallbackIndex));
}

/** Mirrors the web News feed's directional hide-on-scroll rule. */
export function nextNewsSheetConcealed(
  currentlyConcealed: boolean,
  offset: number,
  previousOffset: number,
) {
  if (offset < 24) return false;
  const delta = offset - previousOffset;
  if (delta > 6) return true;
  if (delta < -6) return false;
  return currentlyConcealed;
}
