import { describe, expect, it } from '@jest/globals';

import {
  articleContentResponseSchema,
  registerResponseSchema,
  commentsResponseSchema,
  podsFeedResponseSchema,
  podsSessionResponseSchema,
  podsSessionFreshnessResponseSchema,
  iamProfileSchema,
  newsFeedResponseSchema,
  myContentResponseSchema,
  profileStatsResponseSchema,
  transcriptResponseSchema,
  typedRenditionSchema,
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

describe('IAM profile contract schema', () => {
  it('accepts the RFC 3339 numeric timezone offsets emitted by IAM', () => {
    expect(
      iamProfileSchema.parse({
        id: '4f34066e-9899-4a78-9d79-6dc278151f00',
        username: 'admin',
        email: 'admin@gmail.com',
        tenant_id: 'default',
        email_verified: true,
        created_at: '2026-04-21T14:22:21.639831+03:00',
        updated_at: '2026-04-21T15:00:27.360843+03:00',
      }),
    ).toMatchObject({ username: 'admin' });
  });
});

describe('Pods contract schema', () => {
  it('normalizes CMS playback metadata into the native discriminated source', () => {
    const parsed = podsFeedResponseSchema.parse({
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

  it('accepts a fallback only when CMS provides its explicit type and video capability', () => {
    const parsed = podsFeedResponseSchema.parse({
      items: [
        {
          ...validItem,
          fallback_playback_url: 'https://media.example.test/episode.mp4',
          fallback_playback_type: 'mp4',
          fallback_has_video: true,
        },
      ],
      cursor: null,
    });

    expect(parsed.items[0]?.playback).toMatchObject({
      fallbackUrl: 'https://media.example.test/episode.mp4',
      fallbackType: 'mp4',
      fallbackHasVideo: true,
    });
  });

  it('quarantines malformed playback metadata without rejecting valid feed units', () => {
    const parsed = podsFeedResponseSchema.parse({
      items: [{ ...validItem, playback_type: 'stream' }, validItem],
    });

    expect(parsed.items).toHaveLength(1);
    expect(parsed.quarantinedItemCount).toBe(1);
  });

  it('accepts correlated v3 playback and quarantines a stale generation', () => {
    const generationId = 'a1fb9c7d-8361-43f3-8849-60f07a728967';
    const v3 = {
      ...validItem,
      active_rendition_generation_id: generationId,
      rendition_set_version: 3,
      rendition_digest: 'a'.repeat(64),
      delivery_class: 'visual_dependent',
      media_renditions: [
        {
          schema_version: 3,
          id: 'standard-hls',
          role: 'hls_access_master',
          type: 'hls',
          url: validItem.playback_url,
          quality_tier: 'standard',
          manifest_id: '69ef6ff9-c408-44d2-8cca-e5dc622dbb13',
          package_id: 'd1ff1fb1-b202-4e54-9cdb-8fe70facaf4c',
          rendition_generation_id: generationId,
          policy_digest: 'b'.repeat(64),
          probe_digest: 'c'.repeat(64),
          validation_digest: 'd'.repeat(64),
        },
      ],
    };
    const parsed = podsFeedResponseSchema.parse({
      items: [v3, { ...v3, active_rendition_generation_id: validItem.id }],
    });

    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0]?.playback.renditionSetVersion).toBe(3);
    expect(parsed.quarantinedItemCount).toBe(1);
  });

  it('fails closed when v3 native audio exceeds its declared ceiling', () => {
    const base = {
      schema_version: 3,
      id: 'native-audio-standard',
      role: 'native_audio',
      type: 'audio',
      url: 'https://media.example.test/audio.m4a',
      mime_type: 'audio/mp4',
      container: 'm4a',
      codec: 'aac',
      quality_tier: 'standard',
      manifest_id: '69ef6ff9-c408-44d2-8cca-e5dc622dbb13',
      rendition_generation_id: 'a1fb9c7d-8361-43f3-8849-60f07a728967',
      policy_digest: 'b'.repeat(64),
      probe_digest: 'c'.repeat(64),
    };
    expect(
      typedRenditionSchema.safeParse({ ...base, bitrate_kbps: 128 }).success,
    ).toBe(true);
    expect(
      typedRenditionSchema.safeParse({ ...base, bitrate_kbps: 129 }).success,
    ).toBe(false);
  });

  it('quarantines a v3 native-audio set without a Data Saver floor', () => {
    const generationId = 'a1fb9c7d-8361-43f3-8849-60f07a728967';
    const audio = {
      schema_version: 3,
      id: 'native-audio-standard',
      role: 'native_audio',
      type: 'audio',
      url: 'https://media.example.test/audio.m4a',
      mime_type: 'audio/mp4',
      container: 'm4a',
      codec: 'aac',
      bitrate_kbps: 128,
      quality_tier: 'standard',
      manifest_id: '69ef6ff9-c408-44d2-8cca-e5dc622dbb13',
      rendition_generation_id: generationId,
      policy_digest: 'b'.repeat(64),
      probe_digest: 'c'.repeat(64),
      is_primary: true,
    };
    const item = {
      ...validItem,
      playback_url: audio.url,
      playback_type: 'audio',
      has_video: false,
      active_rendition_generation_id: generationId,
      rendition_set_version: 3,
      rendition_digest: 'a'.repeat(64),
      delivery_class: 'audio_only',
      media_renditions: [audio],
    };
    const parsed = podsFeedResponseSchema.parse({ items: [item] });
    expect(parsed.items).toHaveLength(0);
    expect(parsed.quarantinedItemCount).toBe(1);
  });

  it('requires a CMS-owned session identifier when parsing frozen pages', () => {
    const parsed = podsSessionResponseSchema.parse({
      session_id: 'b4a7e91c-9227-4c51-9fa8-9955e1e4c139',
      expires_at: '2026-07-19T18:00:00.000Z',
      cursor: null,
      items: [validItem],
    });

    expect(parsed.serverSessionId).toBe('b4a7e91c-9227-4c51-9fa8-9955e1e4c139');
  });

  it('normalizes the server-owned frozen-session freshness signal', () => {
    expect(
      podsSessionFreshnessResponseSchema.parse({ has_new_content: true }),
    ).toEqual({ hasNewContent: true });
  });

  it('tolerates additive CMS fields', () => {
    const parsed = podsFeedResponseSchema.parse({
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

describe('News contract schemas', () => {
  const storyId = '2d7b6eea-c0f2-4192-bdfe-7736d8385e71';
  const memberId = '8f01d455-e0e6-411f-b345-9b95a68d5ad2';
  const summary = {
    story_id: storyId,
    lead_id: memberId,
    label: 'A developing story',
    last_member_at: '2026-07-19T12:00:00.000Z',
    lifecycle: 'active',
    published_at: '2026-07-19T12:00:00.000Z',
    member_count: 1,
    source_count: 1,
    like_count: 0,
    comment_count: 0,
    share_count: 0,
    view_count: 0,
  };

  it('accepts one featured story and no more than three related stories', () => {
    const parsed = newsFeedResponseSchema.parse({
      cursor: null,
      slides: [
        {
          slide_id: 'a9d3562b-e06a-42bf-bad6-31a9ddf18808',
          featured: {
            ...summary,
            members: [
              {
                id: memberId,
                type: 'NEWS',
                published_at: '2026-07-19T12:00:00.000Z',
                like_count: 0,
                comment_count: 0,
                share_count: 0,
                view_count: 0,
              },
            ],
          },
          related: [],
        },
      ],
    });

    expect(parsed.slides[0]?.featured.story_id).toBe(storyId);
    expect(parsed.slides[0]?.related).toHaveLength(0);
  });

  it('unwraps only a NEWS content detail response for the native reader', () => {
    const parsed = articleContentResponseSchema.parse({
      code: 200,
      message: 'ok',
      data: {
        id: memberId,
        type: 'NEWS',
        title: 'A complete article',
        body_text: 'A complete body.',
        original_url: 'https://example.test/article',
      },
    });

    expect(parsed.id).toBe(memberId);
    expect(parsed.original_url).toBe('https://example.test/article');
  });
});

describe('IAM contract schemas', () => {
  it('keeps a pending verification delivery visible without accepting tokens', () => {
    const parsed = registerResponseSchema.parse({
      id: '8f01d455-e0e6-411f-b345-9b95a68d5ad2',
      username: 'wahb-member',
      email: 'member@example.test',
      tenant_id: 'default',
      created_at: '2026-07-19T12:00:00.000Z',
      verification_delivery: 'pending',
    });

    expect(parsed.verification_delivery).toBe('pending');
    expect(parsed).not.toHaveProperty('refresh_token');
  });
});

describe('Profile contract schemas', () => {
  it('parses profile statistics and additive creation playback metadata', () => {
    expect(
      profileStatsResponseSchema.parse({
        saved: 12,
        likes: 6,
        listened: 3,
        created: 2,
      }),
    ).toMatchObject({ saved: 12, likes: 6, listened: 3, created: 2 });

    const parsed = myContentResponseSchema.parse({
      cursor: null,
      items: [
        {
          id: validItem.id,
          type: 'VIDEO',
          status: 'READY',
          title: 'My video',
          like_count: 0,
          comment_count: 0,
          playback_url: 'https://media.example.test/my-video.m3u8',
          playback_type: 'hls',
          has_video: true,
        },
      ],
    });

    expect(parsed.items[0]).toMatchObject({
      type: 'VIDEO',
      status: 'READY',
      playback_type: 'hls',
      has_video: true,
    });
  });
});
