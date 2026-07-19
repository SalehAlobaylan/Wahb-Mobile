import { z } from 'zod';

const absoluteHttpUrl = z.url().refine(
  (value) => {
    const protocol = new URL(value).protocol;
    return protocol === 'https:' || protocol === 'http:';
  },
  { message: 'Expected an HTTP(S) URL.' },
);

export const playbackTypeSchema = z.enum(['hls', 'mp4', 'audio']);

export const playbackSourceSchema = z
  .object({
    url: absoluteHttpUrl,
    type: playbackTypeSchema,
    fallbackUrl: absoluteHttpUrl.optional(),
    renditionMetadata: z.unknown().optional(),
    hasVideo: z.boolean(),
  })
  .readonly();

export const forYouItemSchema = z
  .object({
    id: z.uuid(),
    type: z.enum(['VIDEO', 'PODCAST']),
    title: z.string().trim().min(1),
    playback_url: absoluteHttpUrl,
    playback_type: playbackTypeSchema,
    fallback_playback_url: absoluteHttpUrl.nullish(),
    media_renditions: z.unknown().optional(),
    has_video: z.boolean(),
    thumbnail_url: absoluteHttpUrl.optional(),
    duration_sec: z.number().int().min(270).max(2_400),
    parent_id: z.uuid().optional(),
    chapter_index: z.number().int().nonnegative().optional(),
    chapter_start_ms: z.number().int().nonnegative().optional(),
    chapter_end_ms: z.number().int().positive().optional(),
    duration_bucket: z.string().min(1).optional(),
    author: z.string().optional(),
    source_name: z.string().optional(),
    like_count: z.number().int().nonnegative(),
    comment_count: z.number().int().nonnegative(),
    share_count: z.number().int().nonnegative(),
    published_at: z.string().datetime(),
    is_liked: z.boolean(),
    is_bookmarked: z.boolean(),
    is_archived: z.boolean(),
    transcript_id: z.uuid().optional(),
  })
  .passthrough()
  .transform((item) => ({
    ...item,
    playback: {
      url: item.playback_url,
      type: item.playback_type,
      ...(item.fallback_playback_url
        ? { fallbackUrl: item.fallback_playback_url }
        : {}),
      ...(item.media_renditions
        ? { renditionMetadata: item.media_renditions }
        : {}),
      hasVideo: item.has_video,
    },
  }));

export const forYouFeedResponseSchema = z
  .object({
    cursor: z
      .string()
      .nullable()
      .optional()
      .transform((value) => value ?? null),
    items: z.array(z.unknown()),
  })
  .passthrough()
  .transform(({ items, ...response }) => {
    const parsedItems = items.map((item) => forYouItemSchema.safeParse(item));
    const validItems = parsedItems
      .filter(
        (item): item is Extract<typeof item, { success: true }> => item.success,
      )
      .map((item) => item.data);

    return {
      ...response,
      items: validItems,
      quarantinedItemCount: parsedItems.length - validItems.length,
    };
  });

export const forYouSessionResponseSchema = z
  .object({
    session_id: z.uuid(),
    expires_at: z.string().datetime(),
  })
  .passthrough()
  .transform((response) => {
    const page = forYouFeedResponseSchema.parse(response);
    return {
      ...page,
      serverSessionId: response.session_id,
      expiresAt: response.expires_at,
    };
  });

export const interactionTypeSchema = z.enum([
  'like',
  'bookmark',
  'share',
  'view',
  'complete',
]);

export const interactionResponseSchema = z
  .object({
    code: z.number().int(),
    message: z.string(),
    data: z.unknown().optional(),
  })
  .passthrough();

export type PlaybackType = z.infer<typeof playbackTypeSchema>;
export type PlaybackSource = z.infer<typeof playbackSourceSchema>;
export type ForYouItem = z.infer<typeof forYouItemSchema>;
export type ForYouFeedResponse = z.infer<typeof forYouFeedResponseSchema>;
export type ForYouSessionResponse = z.infer<typeof forYouSessionResponseSchema>;
export type InteractionType = z.infer<typeof interactionTypeSchema>;
