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

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
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
