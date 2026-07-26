export const settingsPanels = [
  'language',
  'appearance',
  'playback',
  'legal',
  'security',
] as const;

export type SettingsPanel = (typeof settingsPanels)[number];

export function parseSettingsPanel(value?: string): SettingsPanel | null {
  return settingsPanels.includes(value as SettingsPanel)
    ? (value as SettingsPanel)
    : null;
}
