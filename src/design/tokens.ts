export const colors = {
  paper: '#f8f5f2',
  paperDark: '#1a1a1a',
  ink: '#1a1a1a',
  inkMuted: '#5d5955',
  inkInverse: '#f8f5f2',
  card: '#eae7e3',
  cardDark: '#292725',
  pressRed: '#e63946',
  pressRedDark: '#ff6b6b',
  rule: '#1a1a1a',
} as const;

/**
 * The static light palette remains available for legacy StyleSheet modules.
 * New screens must consume `useWahbTheme()` so the selected appearance is
 * reflected without duplicating the web platform's semantic palette.
 */
export const lightTheme = {
  background: '#f8f5f2',
  foreground: '#1a1a1a',
  card: '#eae7e3',
  muted: '#eae7e3',
  mutedForeground: '#666666',
  border: '#1a1a1a',
  accent: '#e63946',
  accentPressed: '#c1121f',
  inverse: '#f8f5f2',
} as const;

export const darkTheme = {
  background: '#1a1a1a',
  foreground: '#f8f5f2',
  card: '#2a2a2a',
  muted: '#2a2a2a',
  mutedForeground: '#999999',
  border: '#f8f5f2',
  accent: '#ff6b6b',
  accentPressed: '#ff8787',
  inverse: '#1a1a1a',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

/**
 * Shared mobile shell metrics. Full-bleed feeds may ignore the content insets,
 * but their chrome still uses the same horizontal gutter.
 */
export const layoutMetrics = {
  pageGutter: spacing.md,
  pageTop: spacing.md,
  pageBottom: spacing.xxl,
  contentGap: spacing.md,
  sectionGap: spacing.lg,
  controlSize: 44,
} as const;

/**
 * Native type roles calibrated against Wahb-Platform at a 393pt viewport.
 * The role names describe hierarchy, so Arabic and Latin can share layout
 * proportions even though their font families have different glyph metrics.
 */
export const typeScale = {
  micro: { fontSize: 10, lineHeight: 14 },
  label: { fontSize: 11, lineHeight: 15 },
  meta: { fontSize: 12, lineHeight: 17 },
  body: { fontSize: 14, lineHeight: 21 },
  bodyLarge: { fontSize: 16, lineHeight: 25 },
  cardTitle: { fontSize: 14, lineHeight: 19 },
  heading: { fontSize: 20, lineHeight: 26 },
  featureTitle: { fontSize: 24, lineHeight: 30 },
  readerTitle: { fontSize: 24, lineHeight: 31 },
} as const;

export const componentMetrics = {
  compactControl: 36,
  chromeControl: 40,
  minimumTouchTarget: 44,
  displayRailControl: 40,
  nowPlayingTile: 56,
  relatedThumbnailHeight: 56,
  relatedThumbnailWidth: 76,
} as const;

export const radii = {
  compact: 4,
  round: 999,
} as const;

export const fontFamilies = {
  body: 'DMSans',
  bodyMedium: 'DMSansMedium',
  bodyBold: 'DMSansBold',
  editorial: 'PlayfairDisplayBold',
  mono: 'GeistMonoMedium',
  arabic: 'Handicrafts',
  arabicMedium: 'HandicraftsMedium',
  arabicSemiBold: 'HandicraftsSemiBold',
  arabicBold: 'HandicraftsBold',
  arabicBlack: 'HandicraftsBlack',
} as const;
