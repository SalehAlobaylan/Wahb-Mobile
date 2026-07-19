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

const newsStoryMemberSchema = z
  .object({
    id: z.uuid(),
    type: z.literal('NEWS'),
    format: z.string().optional(),
    source: z.string().optional(),
    title: z.string().optional(),
    excerpt: z.string().optional(),
    body_text: z.string().optional(),
    author: z.string().optional(),
    source_name: z.string().optional(),
    thumbnail_url: absoluteHttpUrl.optional(),
    source_image_url: absoluteHttpUrl.optional(),
    published_at: z.string().datetime(),
    like_count: z.number().int().nonnegative(),
    comment_count: z.number().int().nonnegative(),
    share_count: z.number().int().nonnegative(),
    view_count: z.number().int().nonnegative(),
  })
  .passthrough();

const newsStorySummarySchema = z
  .object({
    story_id: z.uuid(),
    lead_id: z.uuid(),
    label: z.string(),
    last_member_at: z.string().datetime(),
    lifecycle: z.string(),
    is_carryover: z.boolean().optional(),
    reason: z.string().optional(),
    summary: z.string().optional(),
    bullets: z.array(z.string()).optional(),
    category: z.string().optional(),
    title: z.string().optional(),
    excerpt: z.string().optional(),
    thumbnail_url: absoluteHttpUrl.optional(),
    source_name: z.string().optional(),
    source_image_url: absoluteHttpUrl.optional(),
    format: z.string().optional(),
    source: z.string().optional(),
    published_at: z.string().datetime(),
    member_count: z.number().int().nonnegative(),
    source_count: z.number().int().nonnegative().optional(),
    like_count: z.number().int().nonnegative(),
    comment_count: z.number().int().nonnegative(),
    share_count: z.number().int().nonnegative(),
    view_count: z.number().int().nonnegative(),
  })
  .passthrough();

export const newsFeedResponseSchema = z
  .object({
    cursor: z.string().nullable(),
    slides: z.array(
      z
        .object({
          slide_id: z.uuid(),
          featured: newsStorySummarySchema.extend({
            members: z.array(newsStoryMemberSchema),
          }),
          related: z.array(newsStorySummarySchema).max(3),
        })
        .passthrough(),
    ),
  })
  .passthrough();

export const articleContentResponseSchema = z
  .object({
    code: z.number().int(),
    message: z.string(),
    data: z
      .object({
        id: z.uuid(),
        type: z.literal('NEWS'),
        title: z.string().nullable().optional(),
        body_text: z.string().nullable().optional(),
        excerpt: z.string().nullable().optional(),
        author: z.string().nullable().optional(),
        source_name: z.string().nullable().optional(),
        thumbnail_url: absoluteHttpUrl.nullable().optional(),
        original_url: absoluteHttpUrl.nullable().optional(),
        published_at: z.string().datetime().nullable().optional(),
        // These remain optional while CMS rolls out translated reader fields.
        // The client only presents a translation when CMS explicitly supplies it.
        translated_title: z.string().nullable().optional(),
        translated_body_text: z.string().nullable().optional(),
        translation_language: z.string().nullable().optional(),
        is_bookmarked: z.boolean().optional(),
      })
      .passthrough(),
  })
  .passthrough()
  .transform(({ data }) => data);

export const authTokenPairSchema = z
  .object({
    access_token: z.string().min(20),
    refresh_token: z.string().uuid(),
    expires_in: z.number().int().positive(),
  })
  .passthrough();

export const registerResponseSchema = z
  .object({
    id: z.string().uuid(),
    username: z.string().min(1),
    email: z.string().email(),
    tenant_id: z.string().min(1),
    created_at: z.string().datetime(),
  })
  .passthrough();

export const messageResponseSchema = z
  .object({ message: z.string().min(1) })
  .passthrough();

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

const commentItemSchema = z
  .object({
    id: z.uuid(),
    text: z.string().trim().min(1),
    author: z.string().optional(),
    is_mine: z.boolean(),
    created_at: z.string().datetime(),
  })
  .passthrough();

export const commentsResponseSchema = z
  .object({
    cursor: z.string().nullable().optional(),
    items: z.array(commentItemSchema),
  })
  .passthrough()
  .transform((response) => ({
    cursor: response.cursor ?? null,
    items: response.items,
  }));

export const transcriptResponseSchema = z
  .object({
    code: z.number().int(),
    message: z.string(),
    data: z
      .object({
        id: z.uuid(),
        content_item_id: z.uuid(),
        full_text: z.string().trim().min(1),
        summary: z.string().nullable().optional(),
        language: z.string().nullable().optional(),
        created_at: z.string().datetime(),
      })
      .passthrough(),
  })
  .passthrough()
  .transform(({ data }) => data);

export type PlaybackType = z.infer<typeof playbackTypeSchema>;
export type PlaybackSource = z.infer<typeof playbackSourceSchema>;
export type ForYouItem = z.infer<typeof forYouItemSchema>;
export type ForYouFeedResponse = z.infer<typeof forYouFeedResponseSchema>;
export type ForYouSessionResponse = z.infer<typeof forYouSessionResponseSchema>;
export type NewsFeedResponse = z.infer<typeof newsFeedResponseSchema>;
export type ArticleContent = z.infer<typeof articleContentResponseSchema>;
export type AuthTokenPair = z.infer<typeof authTokenPairSchema>;
export type RegisteredAccount = z.infer<typeof registerResponseSchema>;
export type InteractionType = z.infer<typeof interactionTypeSchema>;
export type CommentsResponse = z.infer<typeof commentsResponseSchema>;
export type Transcript = z.infer<typeof transcriptResponseSchema>;
