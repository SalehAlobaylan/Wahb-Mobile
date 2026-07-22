import { describe, expect, it } from '@jest/globals';

import { canCompactProgress } from './outbox-compaction';
import { isOutboxEventType } from './outbox-policy';

describe('outbox progress compaction', () => {
  it('replaces a pending progress checkpoint when no semantic event intervenes', () => {
    expect(canCompactProgress(8, null)).toBe(true);
    expect(canCompactProgress(8, 6)).toBe(true);
  });

  it('does not move progress across a semantic event', () => {
    expect(canCompactProgress(8, 8)).toBe(false);
    expect(canCompactProgress(8, 9)).toBe(false);
  });
});

describe('outbox playback evidence types', () => {
  it.each(['quick_skip', 'sampled', 'meaningful', 'complete'])(
    'keeps %s deliverable instead of quarantining it as an unknown row',
    (type) => {
      expect(isOutboxEventType(type)).toBe(true);
    },
  );
});
