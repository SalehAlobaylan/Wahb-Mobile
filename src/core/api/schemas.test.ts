import { describe, expect, it } from '@jest/globals';

import {
  commentsResponseSchema,
  forYouFeedResponseSchema,
  forYouSessionResponseSchema,
  transcriptResponseSchema,
} from './schemas';

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

  it('requires a CMS-owned session identifier when parsing frozen pages', () => {
    const parsed = forYouSessionResponseSchema.parse({
      session_id: 'b4a7e91c-9227-4c51-9fa8-9955e1e4c139',
      expires_at: '2026-07-19T18:00:00.000Z',
      cursor: null,
      items: [validItem],
    });

    expect(parsed.serverSessionId).toBe('b4a7e91c-9227-4c51-9fa8-9955e1e4c139');
  });

  it('tolerates additive CMS fields', () => {
    const parsed = forYouFeedResponseSchema.parse({
      items: [{ ...validItem, future_server_field: { enabled: true } }],
    });

    expect(parsed.items[0]).toHaveProperty('future_server_field');
  });

  it('parses read-only comments without accepting malformed entries', () => {
    const parsed = commentsResponseSchema.parse({
      cursor: null,
      items: [
        {
          id: 'f14edb58-16b8-408d-a445-ae8c13a1d5a2',
          text: 'A useful perspective.',
          author: 'Wahb member',
          is_mine: false,
          created_at: '2026-07-19T12:00:00.000Z',
        },
      ],
    });

    expect(parsed.items[0]?.text).toBe('A useful perspective.');
  });

  it('unwraps the CMS transcript envelope at the contract boundary', () => {
    const parsed = transcriptResponseSchema.parse({
      code: 200,
      message: 'Transcript fetched successfully',
      data: {
        id: '594ca7ce-7e98-4e42-bb92-156df94ad0c4',
        content_item_id: validItem.id,
        full_text: 'A real transcript from CMS.',
        created_at: '2026-07-19T12:00:00.000Z',
      },
    });

    expect(parsed.full_text).toBe('A real transcript from CMS.');
  });
});
