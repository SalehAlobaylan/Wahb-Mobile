import { describe, expect, it } from '@jest/globals';

import { migrations } from './migrations';

describe('database migrations', () => {
  it('are ordered and establish the operational tables', () => {
    expect(migrations.map(({ version }) => version)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13,
    ]);
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

  it('persists the active position required for honest session restoration', () => {
    expect(migrations[1]?.statements).toContain('active_position');
  });

  it('keeps permanent outbox rejections auditable without retrying them', () => {
    expect(migrations[2]?.statements).toContain('event_outbox_rejections');
  });

  it('links recovery-ledger sessions to the CMS-owned frozen session', () => {
    expect(migrations[3]?.statements).toContain('server_session_id');
  });

  it('records exposure and completion delivery exactly once per frozen item', () => {
    expect(migrations[4]?.statements).toContain('view_reported');
    expect(migrations[4]?.statements).toContain('completion_reported');
  });

  it('persists local item hides independently of the player cache', () => {
    expect(migrations[5]?.statements).toContain(
      'CREATE TABLE IF NOT EXISTS hidden_content_items',
    );
  });

  it('keeps complete articles and reader continuity separate from downloads', () => {
    expect(migrations[6]?.statements).toContain(
      'CREATE TABLE IF NOT EXISTS article_snapshots',
    );
    expect(migrations[6]?.statements).toContain(
      'CREATE TABLE IF NOT EXISTS reader_positions',
    );
    expect(migrations[6]?.statements).not.toContain('downloads');
  });

  it('stores a throttled durable playback-progress watermark', () => {
    expect(migrations[7]?.statements).toContain(
      'last_progress_reported_seconds',
    );
  });

  it('keeps server tombstones outside the replayable feed snapshot', () => {
    expect(migrations[8]?.statements).toContain(
      'CREATE TABLE IF NOT EXISTS tombstoned_content_items',
    );
  });

  it('records only stronger playback classifications for a frozen item', () => {
    expect(migrations[9]?.statements).toContain('consumption_classification');
  });

  it('does not assign legacy article state to a new identity', () => {
    expect(migrations[10]?.statements).toContain('article_snapshots_v2');
    expect(migrations[10]?.statements).toContain('identity_scope');
  });

  it('recovers a stale in-flight outbox claim after termination', () => {
    expect(migrations[11]?.statements).toContain('claimed_at');
  });

  it('can park account work while credentials are being restored', () => {
    expect(migrations[12]?.statements).toContain("'auth_blocked'");
  });
});
