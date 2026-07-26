import { Redirect, useLocalSearchParams } from 'expo-router';

import {
  parseSettingsPanel,
  SettingsPanelScreen,
} from '@/features/settings/settings-screen';

export default function SettingsPanelRoute() {
  const { panel } = useLocalSearchParams<{ panel?: string }>();
  const resolved = parseSettingsPanel(panel);

  // Unknown deep links deliberately return to the main settings surface.
  return resolved ? <SettingsPanelScreen panel={resolved} /> : <Redirect href="/settings" />;
}
