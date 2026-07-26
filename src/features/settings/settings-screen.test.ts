import { describe, expect, it } from '@jest/globals';

import { parseSettingsPanel } from './settings-panel';

describe('settings panel parsing', () => {
  it.each(['language', 'appearance', 'playback', 'legal', 'security'])(
    'accepts the %s panel',
    (panel) => {
      expect(parseSettingsPanel(panel)).toBe(panel);
    },
  );

  it('rejects unknown deep-link panels', () => {
    expect(parseSettingsPanel('downloads')).toBeNull();
    expect(parseSettingsPanel()).toBeNull();
  });
});
