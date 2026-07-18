import { describe, expect, it } from '@jest/globals';

import { migrations } from './migrations';

describe('database migrations', () => {
  it('are ordered and establish the operational tables', () => {
    expect(migrations.map(({ version }) => version)).toEqual([1]);
    expect(migrations[0]?.statements).toContain(
      'CREATE TABLE IF NOT EXISTS feed_sessions',
    );
    expect(migrations[0]?.statements).toContain(
      'CREATE TABLE IF NOT EXISTS event_outbox',
    );
  });

  it('does not misrepresent player cache as a download system', () => {
    expect(migrations[0]?.statements).not.toContain('downloads');
  });
});
