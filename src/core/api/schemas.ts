import { z } from 'zod';

const absoluteHttpUrl = z.url().refine(
  (value) => {
    const protocol = new URL(value).protocol;
    return protocol === 'https:' || protocol === 'http:';
  },
  { message: 'Expected an HTTP(S) URL.' },
);

export const playbackTypeSchema = z.enum(['hls', 'mp4', 'audio']);

export const deliveryClassSchema = z.enum([
  'audio_only',
  'audio_first_visual',
  'visual_dependent',
]);

export const typedRenditionSchema = z
  .object({
    schema_version: z.number().int().min(1).max(3).default(1),
    id: z.string().min(1).max(128).optional(),
    role: z.string().min(1).max(64).optional(),
    type: playbackTypeSchema,
    url: absoluteHttpUrl,
    mime_type: z.string().min(1).max(128).optional(),
    container: z.string().min(1).max(32).optional(),
    codec: z.string().max(128).optional(),
    codecs: z.string().max(256).optional(),
    has_video: z.boolean().optional(),
    adaptive: z.boolean().optional(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    bitrate_kbps: z.number().int().positive().optional(),
    quality_tier: z.enum(['data_saver', 'standard', 'high']).optional(),
    manifest_id: z.uuid().optional(),
    package_id: z.uuid().optional(),
    rendition_generation_id: z.uuid().optional(),
    fallback_rendition_id: z.string().max(128).optional(),
    policy_digest: z.string().length(64).optional(),
    probe_digest: z.string().length(64).optional(),
    validation_digest: z.string().length(64).optional(),
    is_primary: z.boolean().optional(),
  })
  .passthrough()
  .superRefine((rendition, context) => {
    if (rendition.schema_version < 3) return;
    const required = [
      ['id', rendition.id],
      ['role', rendition.role],
      ['quality_tier', rendition.quality_tier],
      ['manifest_id', rendition.manifest_id],
      ['rendition_generation_id', rendition.rendition_generation_id],
      ['policy_digest', rendition.policy_digest],
      ['probe_digest', rendition.probe_digest],
    ] as const;
    for (const [field, value] of required) {
      if (!value)
        context.addIssue({
          code: 'custom',
          path: [field],
          message: `v3 rendition requires ${field}`,
        });
    }
    if (
      rendition.type === 'hls' &&
      (!rendition.package_id || !rendition.validation_digest)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['validation_digest'],
        message: 'v3 HLS rendition requires verified package correlation',
      });
    }
    if (rendition.type === 'audio') {
      const ceilings = { data_saver: 64, standard: 128, high: 192 } as const;
      const tier = rendition.quality_tier;
      const ceiling = tier ? ceilings[tier] : undefined;
      if (
        !rendition.bitrate_kbps ||
        !ceiling ||
        rendition.bitrate_kbps > ceiling
      ) {
        context.addIssue({
          code: 'custom',
          path: ['bitrate_kbps'],
          message: 'v3 audio bitrate must fit its declared quality ceiling',
        });
      }
      const legalAudio =
        (rendition.mime_type === 'audio/mp4' &&
          rendition.container === 'm4a' &&
          rendition.codec === 'aac') ||
        (rendition.mime_type === 'audio/mpeg' &&
          rendition.container === 'mp3' &&
          rendition.codec === 'mp3');
      if (!legalAudio) {
        context.addIssue({
          code: 'custom',
          path: ['mime_type'],
          message:
            'v3 audio requires a supported exact MIME/container/codec tuple',
        });
      }
    }
  });

export const playbackSourceSchema = z
  .object({
    url: absoluteHttpUrl,
    type: playbackTypeSchema,
    fallbackUrl: absoluteHttpUrl.optional(),
    fallbackType: playbackTypeSchema.optional(),
    fallbackHasVideo: z.boolean().optional(),
    renditionMetadata: z.unknown().optional(),
    activeRenditionGenerationId: z.uuid().optional(),
    renditionSetVersion: z.number().int().min(1).max(3).optional(),
    renditionDigest: z.string().length(64).optional(),
    deliveryClass: deliveryClassSchema.optional(),
    renditions: z.array(typedRenditionSchema).optional(),
    hasVideo: z.boolean(),
  })
  .readonly();

export const podsItemSchema = z
  .object({
    id: z.uuid(),
    type: z.enum(['VIDEO', 'PODCAST']),
    title: z.string().trim().min(1),
    playback_url: absoluteHttpUrl,
    playback_type: playbackTypeSchema,
    fallback_playback_url: absoluteHttpUrl.nullish(),
    fallback_playback_type: playbackTypeSchema.optional(),
    fallback_has_video: z.boolean().optional(),
    active_rendition_generation_id: z.uuid().optional(),
    rendition_set_version: z.number().int().min(1).max(3).optional(),
    rendition_digest: z.string().length(64).optional(),
    delivery_class: deliveryClassSchema.optional(),
    media_renditions: z.array(typedRenditionSchema).optional(),
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
    // Decoration is interpreted separately; malformed profiles cannot reject media.
    audio_scene_profile: z.unknown().optional(),
  })
  .passthrough()
  .superRefine((item, context) => {
    if (item.rendition_set_version !== 3) return;
    if (
      !item.active_rendition_generation_id ||
      !item.rendition_digest ||
      !item.delivery_class ||
      !item.media_renditions?.length
    ) {
      context.addIssue({
        code: 'custom',
        path: ['rendition_set_version'],
        message: 'v3 playback requires active generation metadata',
      });
      return;
    }
    if (
      item.media_renditions.some(
        (rendition) =>
          rendition.schema_version !== 3 ||
          rendition.rendition_generation_id !==
            item.active_rendition_generation_id,
      )
    ) {
      context.addIssue({
        code: 'custom',
        path: ['media_renditions'],
        message: 'v3 renditions must belong to the active generation',
      });
    }
    const audioTiers = item.media_renditions
      .filter((rendition) => rendition.type === 'audio')
      .map((rendition) => rendition.quality_tier);
    if (
      audioTiers.length > 0 &&
      (!audioTiers.includes('data_saver') ||
        new Set(audioTiers).size !== audioTiers.length)
    ) {
      context.addIssue({
        code: 'custom',
        path: ['media_renditions'],
        message: 'v3 native audio requires unique tiers and a Data Saver floor',
      });
    }
    const active = item.media_renditions.find(
      (rendition) => rendition.url === item.playback_url,
    );
    if (!active || active.type !== item.playback_type) {
      context.addIssue({
        code: 'custom',
        path: ['playback_url'],
        message: 'v3 playback must project an active typed rendition',
      });
    }
  })
  .transform((item) => ({
    ...item,
    playback: {
      url: item.playback_url,
      type: item.playback_type,
      ...(item.fallback_playback_url
        ? { fallbackUrl: item.fallback_playback_url }
        : {}),
      ...(item.fallback_playback_type
        ? { fallbackType: item.fallback_playback_type }
        : {}),
      ...(item.fallback_has_video !== undefined
        ? { fallbackHasVideo: item.fallback_has_video }
        : {}),
      ...(item.media_renditions
        ? { renditionMetadata: item.media_renditions }
        : {}),
      ...(item.active_rendition_generation_id
        ? { activeRenditionGenerationId: item.active_rendition_generation_id }
        : {}),
      ...(item.rendition_set_version
        ? { renditionSetVersion: item.rendition_set_version }
        : {}),
      ...(item.rendition_digest
        ? { renditionDigest: item.rendition_digest }
        : {}),
      ...(item.delivery_class ? { deliveryClass: item.delivery_class } : {}),
      ...(item.media_renditions ? { renditions: item.media_renditions } : {}),
      hasVideo: item.has_video,
    },
  }));

export const podsFeedResponseSchema = z
  .object({
    cursor: z
      .string()
      .nullable()
      .optional()
      .transform((value) => value ?? null),
    items: z.array(z.unknown()),
    caught_up: z.boolean().optional().default(false),
  })
  .passthrough()
  .transform(({ items, ...response }) => {
    const parsedItems = items.map((item) => podsItemSchema.safeParse(item));
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

export const podsSessionResponseSchema = z
  .object({
    session_id: z.uuid(),
    expires_at: z.string().datetime(),
    caught_up: z.boolean().optional().default(false),
  })
  .passthrough()
  .transform((response) => {
    const page = podsFeedResponseSchema.parse(response);
    return {
      ...page,
      serverSessionId: response.session_id,
      expiresAt: response.expires_at,
    };
  });

export const podsSessionFreshnessResponseSchema = z
  .object({ has_new_content: z.boolean() })
  .passthrough()
  .transform((response) => ({ hasNewContent: response.has_new_content }));

export const contentPlaybackResponseSchema = z
  .object({
    content_item_id: z.uuid(),
    active_rendition_generation_id: z.uuid(),
    rendition_set_version: z.number().int().min(1).max(3),
    rendition_digest: z.string().length(64),
    delivery_class: deliveryClassSchema,
    playback_url: absoluteHttpUrl.nullish(),
    playback_type: playbackTypeSchema.optional(),
    fallback_playback_url: absoluteHttpUrl.nullish(),
    has_video: z.boolean().optional().default(false),
    media_renditions: z.array(typedRenditionSchema).min(1),
  })
  .passthrough()
  .transform((value) => ({
    ...value,
    playback: {
      url:
        value.playback_url ??
        value.media_renditions.find((rendition) => rendition.is_primary)?.url ??
        value.media_renditions[0]!.url,
      type:
        value.playback_type ??
        value.media_renditions.find((rendition) => rendition.is_primary)
          ?.type ??
        value.media_renditions[0]!.type,
      hasVideo: value.has_video,
      activeRenditionGenerationId: value.active_rendition_generation_id,
      renditionSetVersion: value.rendition_set_version,
      renditionDigest: value.rendition_digest,
      deliveryClass: value.delivery_class,
      renditions: value.media_renditions,
    },
  }));

export const playbackPreferencesSchema = z
  .object({
    audio_quality: z
      .enum(['data_saver', 'standard', 'high'])
      .default('standard'),
    streaming_quality: z
      .enum(['auto', 'data_saver', 'standard', 'high'])
      .default('auto'),
    allow_cellular_high_quality: z.boolean().default(false),
    prefer_audio_when_available: z.boolean().default(true),
  })
  .passthrough();

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
    source_image_url: absoluteHttpUrl.optional(),
    source_name: z.string().optional(),
    format: z.string().optional(),
    source: z.string().optional(),
    published_at: z.string().datetime(),
    member_count: z.number().int().nonnegative(),
    source_count: z.number().int().nonnegative().optional(),
    like_count: z.number().int().nonnegative(),
    comment_count: z.number().int().nonnegative(),
    share_count: z.number().int().nonnegative(),
    view_count: z.number().int().nonnegative(),
    is_liked: z.boolean().optional().default(false),
    is_bookmarked: z.boolean().optional().default(false),
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
        source_image_url: absoluteHttpUrl.nullable().optional(),
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

export const iamRolesSchema = z
  .object({
    user_id: z.uuid(),
    email: z.string().email(),
    tenant_id: z.string().min(1),
    role: z.string().optional(),
    roles: z.array(z.string()).default([]),
    permissions: z.array(z.string()).default([]),
    is_admin: z.boolean().optional().default(false),
  })
  .passthrough();

export const registerResponseSchema = z
  .object({
    id: z.string().uuid(),
    username: z.string().min(1),
    email: z.string().email(),
    tenant_id: z.string().min(1),
    created_at: z.string().datetime(),
    verification_delivery: z.enum(['sent', 'pending']).optional(),
  })
  .passthrough();

export const messageResponseSchema = z
  .object({ message: z.string().min(1) })
  .passthrough();

export const interactionTypeSchema = z.enum([
  'like',
  'bookmark',
  'hide',
  'share',
  'view',
  'progress',
  'quick_skip',
  'sampled',
  'meaningful',
  'complete',
  'comment',
]);

export const interactionResponseSchema = z
  .object({
    code: z.number().int(),
    message: z.string(),
    data: z.unknown().optional(),
  })
  .passthrough();

export const moderationReasonSchema = z.enum([
  'harmful_inappropriate',
  'misinformation',
  'copyright',
  'broken_media',
  'incorrect_language_translation',
  'other',
]);

export const moderationReportResponseSchema = z
  .object({ id: z.uuid(), status: z.literal('received') })
  .passthrough();

const savedContentItemSchema = z
  .object({
    id: z.uuid(),
    type: z.enum(['NEWS', 'VIDEO', 'PODCAST']),
    title: z.string().nullable().optional(),
    thumbnail_url: absoluteHttpUrl.nullable().optional(),
    source_name: z.string().nullable().optional(),
    author: z.string().nullable().optional(),
    published_at: z.string().datetime().nullable().optional(),
    bookmarked_at: z.string().datetime().optional(),
    playback_url: absoluteHttpUrl.optional(),
    playback_type: playbackTypeSchema.optional(),
    fallback_playback_url: absoluteHttpUrl.nullable().optional(),
    fallback_playback_type: playbackTypeSchema.optional(),
    fallback_has_video: z.boolean().optional(),
    has_video: z.boolean().optional(),
    duration_sec: z.number().int().positive().optional(),
    is_bookmarked: z.boolean().optional(),
  })
  .passthrough();

const profileStatsSchema = z
  .object({
    saved: z.number().int().nonnegative(),
    likes: z.number().int().nonnegative(),
    listened: z.number().int().nonnegative(),
    created: z.number().int().nonnegative(),
  })
  .passthrough();

const myContentItemSchema = z
  .object({
    id: z.uuid(),
    type: z.enum(['NEWS', 'ARTICLE', 'VIDEO', 'PODCAST']),
    status: z.enum(['PENDING', 'PROCESSING', 'READY', 'FAILED', 'ARCHIVED']),
    title: z.string().optional(),
    excerpt: z.string().optional(),
    thumbnail_url: absoluteHttpUrl.optional(),
    duration_sec: z.number().int().nonnegative().optional(),
    like_count: z.number().int().nonnegative(),
    comment_count: z.number().int().nonnegative(),
    published_at: z.string().datetime().optional(),
    playback_url: absoluteHttpUrl.optional(),
    playback_type: playbackTypeSchema.optional(),
    fallback_playback_url: absoluteHttpUrl.optional(),
    fallback_playback_type: playbackTypeSchema.optional(),
    fallback_has_video: z.boolean().optional(),
    has_video: z.boolean().optional(),
  })
  .passthrough();

export const savedContentResponseSchema = z
  .object({
    cursor: z.string().nullable().optional(),
    items: z.array(savedContentItemSchema),
  })
  .passthrough()
  .transform((response) => ({
    cursor: response.cursor ?? null,
    items: response.items,
  }));

export const likedContentResponseSchema = savedContentResponseSchema;

export const profileStatsResponseSchema = profileStatsSchema;

export const myContentResponseSchema = z
  .object({
    cursor: z.string().nullable().optional(),
    items: z.array(myContentItemSchema),
  })
  .passthrough()
  .transform((response) => ({
    cursor: response.cursor ?? null,
    items: response.items,
  }));

export const historyResponseSchema = z
  .object({
    cursor: z.string().nullable().optional(),
    items: z.array(
      z
        .object({
          content_id: z.uuid(),
          viewed_at: z.string().datetime(),
          type: z.enum(['NEWS', 'VIDEO', 'PODCAST']),
          title: z.string().optional(),
          thumbnail_url: absoluteHttpUrl.nullable().optional(),
          media_url: absoluteHttpUrl.nullable().optional(),
          duration_sec: z.number().int().positive().nullable().optional(),
          author: z.string().nullable().optional(),
          source_name: z.string().nullable().optional(),
          progress_seconds: z
            .number()
            .int()
            .nonnegative()
            .nullable()
            .optional(),
        })
        .passthrough(),
    ),
  })
  .passthrough()
  .transform((response) => ({
    cursor: response.cursor ?? null,
    items: response.items,
  }));

const topicSchema = z
  .object({
    id: z.uuid(),
    slug: z.string().min(1),
    label_ar: z.string().min(1),
    label_en: z.string().min(1),
    category_slug: z.string().min(1),
    state: z.string().optional(),
  })
  .passthrough();

export const topicPickerResponseSchema = z
  .object({
    categories: z.array(z.unknown()),
    topics: z.array(topicSchema),
  })
  .passthrough();

export const preferencesResponseSchema = z
  .object({
    declared: z.array(topicSchema),
    learned: z.array(topicSchema),
    muted: z.array(topicSchema),
    muted_sources: z
      .array(
        z.object({
          source_key: z.string().min(1),
          state: z.literal('muted'),
        }),
      )
      .optional()
      .default([]),
  })
  .passthrough();

export const sourcePreferenceResponseSchema = z
  .object({
    source_key: z.string().min(1),
    state: z.enum(['muted', 'active']),
  })
  .passthrough();

export const iamProfileSchema = z
  .object({
    id: z.uuid(),
    username: z.string().min(1),
    email: z.string().email(),
    tenant_id: z.string().min(1),
    email_verified: z.boolean(),
    bio: z.string().nullable().optional(),
    avatar_url: absoluteHttpUrl.nullable().optional(),
    interests: z.array(z.string()).nullable().optional(),
    // IAM serializes Go time values with a numeric RFC 3339 offset in local
    // development (for example `+03:00`), while production may use `Z`.
    // Both are valid instants and must not turn a successful profile response
    // into a client-side contract failure.
    created_at: z.string().datetime({ offset: true }),
    updated_at: z.string().datetime({ offset: true }),
  })
  .passthrough();

const commentItemSchema = z
  .object({
    id: z.uuid(),
    text: z.string().trim().min(1),
    author: z.string().optional(),
    author_id: z.uuid().nullable().optional(),
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
        // The CMS preserves provider-native timestamp shapes. The display layer
        // normalizes this defensively because Deepgram and Whisper differ.
        word_timestamps: z.unknown().nullable().optional(),
        segments: z.unknown().nullable().optional(),
        language: z.string().nullable().optional(),
        created_at: z.string().datetime(),
      })
      .passthrough(),
  })
  .passthrough()
  .transform(({ data }) => data);

export const transcriptionRequestResponseSchema = z
  .object({
    code: z.number().int().optional(),
    data: z
      .object({ status: z.enum(['exists', 'processing']) })
      .passthrough()
      .optional(),
    status: z.enum(['exists', 'processing']).optional(),
  })
  .passthrough()
  .transform((response) => ({
    status: response.data?.status ?? response.status!,
  }));

export type PlaybackType = z.infer<typeof playbackTypeSchema>;
export type PlaybackSource = z.infer<typeof playbackSourceSchema>;
export type ContentPlayback = z.infer<typeof contentPlaybackResponseSchema>;
export type PlaybackPreferences = z.infer<typeof playbackPreferencesSchema>;
export type TypedRendition = z.infer<typeof typedRenditionSchema>;
export type PodsItem = z.infer<typeof podsItemSchema>;
export type PodsFeedResponse = z.infer<typeof podsFeedResponseSchema>;
export type PodsSessionResponse = z.infer<typeof podsSessionResponseSchema>;
export type PodsSessionFreshnessResponse = z.infer<
  typeof podsSessionFreshnessResponseSchema
>;
export type NewsFeedResponse = z.infer<typeof newsFeedResponseSchema>;
export type ArticleContent = z.infer<typeof articleContentResponseSchema>;
export type AuthTokenPair = z.infer<typeof authTokenPairSchema>;
export type RegisteredAccount = z.infer<typeof registerResponseSchema>;
export type InteractionType = z.infer<typeof interactionTypeSchema>;
export type CommentsResponse = z.infer<typeof commentsResponseSchema>;
export type Transcript = z.infer<typeof transcriptResponseSchema>;
export type TranscriptionRequest = z.infer<
  typeof transcriptionRequestResponseSchema
>;
export type SavedContentResponse = z.infer<typeof savedContentResponseSchema>;
export type SavedContentItem = SavedContentResponse['items'][number];
export type LikedContentResponse = z.infer<typeof likedContentResponseSchema>;
export type ProfileStats = z.infer<typeof profileStatsResponseSchema>;
export type MyContentResponse = z.infer<typeof myContentResponseSchema>;
export type MyContentItem = MyContentResponse['items'][number];
export type HistoryResponse = z.infer<typeof historyResponseSchema>;
export type HistoryItem = HistoryResponse['items'][number];
export type TopicPickerResponse = z.infer<typeof topicPickerResponseSchema>;
export type PreferencesResponse = z.infer<typeof preferencesResponseSchema>;
export type IamProfile = z.infer<typeof iamProfileSchema>;
export type IamRoles = z.infer<typeof iamRolesSchema>;
export type ModerationReason = z.infer<typeof moderationReasonSchema>;
