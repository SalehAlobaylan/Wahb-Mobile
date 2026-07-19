import { describe, expect, it } from '@jest/globals';

import { forYouFeedResponseSchema } from './schemas';

const validItem = {
  id: '4f34066e-9899-4a78-9d79-6dc278151f00',
  type: 'PODCAST',
  title: 'The future of Arabic media',
  playback_url: 'https://media.example.test/episode.m3u8',
  playback_type: 'hls',
  has_video: true,
  duration_sec: 600,
  like_count: 1,
  comment_count: 2,
  share_count: 3,
  published_at: '2026-07-19T12:00:00.000Z',
  is_liked: false,
  is_bookmarked: false,
  is_archived: false,
};

describe('For You contract schema', () => {
  it('normalizes CMS playback metadata into the native discriminated source', () => {
    const parsed = forYouFeedResponseSchema.parse({
      items: [validItem],
      cursor: null,
    });

    expect(parsed.cursor).toBeNull();
    expect(parsed.items[0]?.playback).toMatchObject({
      url: validItem.playback_url,
      type: 'hls',
      hasVideo: true,
    });
  });

  it('quarantines malformed playback metadata without rejecting valid feed units', () => {
    const parsed = forYouFeedResponseSchema.parse({
      items: [{ ...validItem, playback_type: 'stream' }, validItem],
    });

    expect(parsed.items).toHaveLength(1);
    expect(parsed.quarantinedItemCount).toBe(1);
  });

  it('tolerates additive CMS fields', () => {
    const parsed = forYouFeedResponseSchema.parse({
      items: [{ ...validItem, future_server_field: { enabled: true } }],
    });

    expect(parsed.items[0]).toHaveProperty('future_server_field');
  });
});
