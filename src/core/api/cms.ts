import {
  commentsResponseSchema,
  podsFeedResponseSchema,
  podsSessionResponseSchema,
  podsSessionFreshnessResponseSchema,
  interactionResponseSchema,
  moderationReasonSchema,
  moderationReportResponseSchema,
  interactionTypeSchema,
  historyResponseSchema,
  preferencesResponseSchema,
  sourcePreferenceResponseSchema,
  savedContentResponseSchema,
  likedContentResponseSchema,
  myContentResponseSchema,
  profileStatsResponseSchema,
  topicPickerResponseSchema,
  articleContentResponseSchema,
  newsFeedResponseSchema,
  transcriptResponseSchema,
  transcriptionRequestResponseSchema,
  type PodsFeedResponse,
  type PodsSessionResponse,
  type PodsSessionFreshnessResponse,
  type InteractionType,
  type ArticleContent,
  type NewsFeedResponse,
  type CommentsResponse,
  type Transcript,
  type TranscriptionRequest,
  type HistoryResponse,
  type PreferencesResponse,
  type SavedContentResponse,
  type LikedContentResponse,
  type MyContentResponse,
  type ProfileStats,
  type TopicPickerResponse,
  type ModerationReason,
  type ContentPlayback,
  type PlaybackPreferences,
  contentPlaybackResponseSchema,
  playbackPreferencesSchema,
} from './schemas';
import type { Transport } from './transport';
import { HttpError } from './errors';
import { z } from 'zod';

// Initial frozen sessions involve CMS ranking and can take longer than a
// regular interaction request on a local development data set. Do not present
// that normal work as an offline failure after the transport default expires.
export const podsSessionCreationTimeoutMs = 120_000;

export type PodsPageRequest = {
  cursor?: string;
  limit?: number;
  installationId: string;
  excludeSeen?: boolean;
  contentLanguage?: 'ar' | 'en' | 'both';
  signal?: AbortSignal;
};

export type CmsApi = {
  getContentPlayback(
    id: string,
    etag?: string,
    signal?: AbortSignal,
  ): Promise<ContentPlayback | null>;
  recordPlaybackHealth(request: PlaybackHealthRequest): Promise<void>;
  getPlaybackPreferences(signal?: AbortSignal): Promise<PlaybackPreferences>;
  updatePlaybackPreferences(
    input: Partial<PlaybackPreferences>,
  ): Promise<PlaybackPreferences>;
  getDeliveryRepairHistory(): Promise<{ repairs: unknown[] }>;
  getDeliveryDiagnostics(contentId: string): Promise<Record<string, unknown>>;
  previewDeliveryRepair(contentId: string): Promise<Record<string, unknown>>;
  requestDeliveryRepair(
    contentId: string,
    previewDigest: string,
  ): Promise<Record<string, unknown>>;
  rollbackDeliveryGeneration(generationId: string): Promise<void>;
  getDeliveryPolicies(): Promise<{ data: DeliveryPolicySummary[] }>;
  createDeliveryPolicy(
    input: DeliveryPolicyMutation,
  ): Promise<DeliveryPolicySummary>;
  updateDeliveryPolicy(
    policyId: string,
    input: Partial<DeliveryPolicyMutation>,
  ): Promise<DeliveryPolicySummary>;
  setDeliveryPolicyActive(policyId: string, active: boolean): Promise<void>;
  getArticleContent(id: string, signal?: AbortSignal): Promise<ArticleContent>;
  getNewsPage(request: NewsPageRequest): Promise<NewsFeedResponse>;
  getPodsPage(request: PodsPageRequest): Promise<PodsFeedResponse>;
  createPodsSession(request: PodsSessionRequest): Promise<PodsSessionResponse>;
  getPodsSessionPage(
    request: PodsSessionPageRequest,
  ): Promise<PodsSessionResponse>;
  getPodsSessionFreshness(
    request: PodsSessionFreshnessRequest,
  ): Promise<PodsSessionFreshnessResponse>;
  getComments(request: CommentsRequest): Promise<CommentsResponse>;
  getTranscript(
    transcriptId: string,
    signal?: AbortSignal,
  ): Promise<Transcript>;
  requestTranscription(
    contentId: string,
    signal?: AbortSignal,
  ): Promise<TranscriptionRequest>;
  createInteraction(request: CreateInteractionRequest): Promise<void>;
  deleteInteraction(request: DeleteInteractionRequest): Promise<void>;
  deleteComment(commentId: string, sessionId: string): Promise<void>;
  getSavedContent(request: SavedContentRequest): Promise<SavedContentResponse>;
  getLikedContent(request: CursorRequest): Promise<LikedContentResponse>;
  getProfileStats(signal?: AbortSignal): Promise<ProfileStats>;
  getMyContent(request: MyContentRequest): Promise<MyContentResponse>;
  getHistory(request: HistoryRequest): Promise<HistoryResponse>;
  clearHistory(sessionId: string): Promise<void>;
  getTopicPicker(signal?: AbortSignal): Promise<TopicPickerResponse>;
  getPreferences(signal?: AbortSignal): Promise<PreferencesResponse>;
  updateDeclaredTopics(topicIds: string[]): Promise<PreferencesResponse>;
  muteTopic(topicId: string): Promise<PreferencesResponse>;
  unmuteTopic(topicId: string): Promise<PreferencesResponse>;
  muteSource(contentId: string): Promise<void>;
  unmuteSource(sourceKey: string): Promise<void>;
  reportModeration(request: ModerationReportRequest): Promise<void>;
  blockAuthor(authorId: string): Promise<void>;
  unblockAuthor(authorId: string): Promise<void>;
};

export type DeliveryPolicySummary = {
  id: string;
  name: string;
  media_kind: string;
  rollout_state: string;
  active: boolean;
  primary_mode: string;
  policy_digest?: string;
  tenant_id?: string;
  allow_hls: boolean;
  generate_progressive_fallback: boolean;
  variants: DeliveryPolicyVariant[];
};

export type DeliveryPolicyVariant = {
  rendition_type: 'audio' | 'progressive' | 'hls';
  quality_tier: 'data_saver' | 'standard' | 'high';
  priority: number;
  required: boolean;
  enabled: boolean;
};

export type DeliveryPolicyMutation = {
  name: string;
  media_kind: 'audio' | 'video';
  primary_mode: 'audio' | 'progressive' | 'hls';
  rollout_state: 'shadow' | 'active' | 'paused';
  allow_hls: boolean;
  generate_progressive_fallback: boolean;
  hls_segment_duration_sec: 6;
  hls_segment_format: 'cmaf';
  hls_min_variants: number;
  variants: DeliveryPolicyVariant[];
  short_form_delivery?: boolean;
  allow_native_audio?: boolean;
  allow_mp4_fallback?: boolean;
  allow_passthrough?: boolean;
  allow_remux?: boolean;
  generate_audio_alternate?: boolean;
  preserve_video?: boolean;
  active?: boolean;
  max_delivery_height?: number;
  max_delivery_bitrate_kbps?: number;
  cache_profile?: string;
};

const deliveryPolicyVariantSchema = z
  .object({
    rendition_type: z.enum(['audio', 'progressive', 'hls']),
    quality_tier: z.enum(['data_saver', 'standard', 'high']),
    priority: z.number().int(),
    required: z.boolean(),
    enabled: z.boolean(),
  })
  .passthrough();

const deliveryPolicySummarySchema = z
  .object({
    id: z.uuid(),
    name: z.string(),
    media_kind: z.string(),
    rollout_state: z.string(),
    active: z.boolean(),
    primary_mode: z.string(),
    policy_digest: z.string().optional(),
    tenant_id: z.string().optional(),
    allow_hls: z.boolean().default(false),
    generate_progressive_fallback: z.boolean().default(true),
    variants: z.array(deliveryPolicyVariantSchema).default([]),
  })
  .passthrough();

export type PlaybackHealthRequest = {
  contentId: string;
  renditionGenerationId?: string;
  renditionId: string;
  failureClass:
    'load' | 'decode' | 'stall' | 'seek' | 'manifest' | 'fallback_exhausted';
  platform: 'ios' | 'android';
  appBuild: string;
  networkClass: 'wifi' | 'cellular' | 'offline' | 'unknown' | 'expensive';
  idempotencyKey: string;
};

export type NewsPageRequest = {
  cursor?: string;
  limit?: number;
  installationId: string;
  window?: 'today' | 'week' | 'month';
  signal?: AbortSignal;
};

export type CreateInteractionRequest = {
  contentId: string;
  type: InteractionType;
  sessionId: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
  signal?: AbortSignal;
};

export type DeleteInteractionRequest = {
  contentId: string;
  type: Extract<InteractionType, 'like' | 'bookmark'>;
  sessionId: string;
  signal?: AbortSignal;
};

export type PodsSessionRequest = {
  installationId: string;
  limit?: number;
  signal?: AbortSignal;
  contentLanguage?: 'ar' | 'en' | 'both';
  /** The CMS resolves this to its nearest legal Pods duration bucket. */
  duration?: 5 | 10 | 15 | 20 | 30 | 40;
};

export type PodsSessionPageRequest = PodsSessionRequest & {
  sessionId: string;
  cursor?: string;
};

export type PodsSessionFreshnessRequest = Pick<
  PodsSessionRequest,
  'installationId' | 'signal' | 'duration' | 'contentLanguage'
> & {
  sessionId: string;
};

export type CommentsRequest = {
  contentId: string;
  installationId: string;
  cursor?: string;
  limit?: number;
  signal?: AbortSignal;
};

export type SavedContentRequest = {
  cursor?: string;
  limit?: number;
  sort?: 'saved_desc' | 'saved_asc';
  feed?: 'all' | 'pods' | 'news';
  /** Device identity keeps anonymous bookmarks visible before sign-in. */
  installationId?: string;
  /** Server-side title, source, and author search. */
  q?: string;
  signal?: AbortSignal;
};

export type CursorRequest = {
  cursor?: string;
  limit?: number;
  signal?: AbortSignal;
};

export type MyContentRequest = CursorRequest & {
  type: 'NEWS' | 'ARTICLE' | 'VIDEO' | 'PODCAST';
};

export type HistoryRequest = {
  installationId: string;
  cursor?: string;
  limit?: number;
  signal?: AbortSignal;
};

export type ModerationReportRequest = {
  targetType: 'content' | 'comment';
  targetId: string;
  reason: ModerationReason;
  detail?: string;
  installationId: string;
  idempotencyKey: string;
};

export function createCmsApi(transport: Transport): CmsApi {
  return {
    getContentPlayback(id, etag, signal) {
      return transport
        .request(
          {
            path: `/api/v1/content/${id}/playback`,
            signal,
            authenticated: true,
            headers: etag ? { 'If-None-Match': etag } : undefined,
          },
          contentPlaybackResponseSchema,
        )
        .catch((error) => {
          if (error instanceof HttpError && error.context.status === 304)
            return null;
          throw error;
        });
    },
    async recordPlaybackHealth(request) {
      await transport.request(
        {
          path: `/api/v1/content/${request.contentId}/playback-health`,
          method: 'POST',
          authenticated: true,
          idempotencyKey: request.idempotencyKey,
          body: {
            rendition_generation_id: request.renditionGenerationId,
            rendition_id: request.renditionId,
            failure_class: request.failureClass,
            platform: request.platform,
            app_build: request.appBuild,
            network_class: request.networkClass,
          },
        },
        z.object({ status: z.string() }).passthrough(),
      );
    },
    getPlaybackPreferences(signal) {
      return transport.request(
        { path: '/api/v1/preferences/playback', signal, authenticated: true },
        playbackPreferencesSchema,
      );
    },
    updatePlaybackPreferences(input) {
      return transport.request(
        {
          path: '/api/v1/preferences/playback',
          method: 'PUT',
          body: input,
          authenticated: true,
        },
        playbackPreferencesSchema,
      );
    },
    getArticleContent(id, signal) {
      return transport.request(
        { path: `/api/v1/content/${id}`, signal, authenticated: true },
        articleContentResponseSchema,
      );
    },
    getDeliveryRepairHistory() {
      return transport.request(
        { path: '/admin/media/delivery/repairs', authenticated: true },
        z.object({ repairs: z.array(z.unknown()) }).passthrough(),
      );
    },
    getDeliveryDiagnostics(contentId) {
      return transport.request(
        {
          path: `/admin/media/delivery/content/${contentId}/diagnostics`,
          authenticated: true,
        },
        z.record(z.string(), z.unknown()),
      );
    },
    previewDeliveryRepair(contentId) {
      return transport.request(
        {
          path: `/admin/media/delivery/preview/${contentId}`,
          authenticated: true,
        },
        z.record(z.string(), z.unknown()),
      );
    },
    requestDeliveryRepair(contentId, previewDigest) {
      return transport.request(
        {
          path: '/admin/media/delivery/repairs',
          method: 'POST',
          authenticated: true,
          body: { content_item_id: contentId, preview_digest: previewDigest },
        },
        z.record(z.string(), z.unknown()),
      );
    },
    async rollbackDeliveryGeneration(generationId) {
      await transport.request(
        {
          path: `/admin/media/delivery/generations/${generationId}/rollback`,
          method: 'POST',
          authenticated: true,
        },
        z.object({}).passthrough(),
      );
    },
    getDeliveryPolicies() {
      return transport.request(
        { path: '/admin/media/delivery/policies', authenticated: true },
        z.object({ data: z.array(deliveryPolicySummarySchema) }).passthrough(),
      );
    },
    createDeliveryPolicy(input) {
      return transport.request(
        {
          path: '/admin/media/delivery/policies',
          method: 'POST',
          authenticated: true,
          body: input,
        },
        deliveryPolicySummarySchema,
      );
    },
    updateDeliveryPolicy(policyId, input) {
      return transport.request(
        {
          path: `/admin/media/delivery/policies/${policyId}`,
          method: 'PUT',
          authenticated: true,
          body: input,
        },
        deliveryPolicySummarySchema,
      );
    },
    async setDeliveryPolicyActive(policyId, active) {
      await transport.request(
        {
          path: `/admin/media/delivery/policies/${policyId}/active`,
          method: 'PATCH',
          authenticated: true,
          body: { active },
        },
        z.object({ status: z.literal('updated') }).passthrough(),
      );
    },
    getNewsPage({ cursor, limit = 10, installationId, window, signal }) {
      return transport.request(
        {
          path: '/api/v1/feed/news',
          query: {
            ...(cursor ? { cursor } : {}),
            ...(window ? { window } : {}),
            limit,
            session_id: installationId,
          },
          signal,
          authenticated: true,
        },
        newsFeedResponseSchema,
      );
    },
    getPodsPage({
      cursor,
      limit = 10,
      installationId,
      excludeSeen = false,
      contentLanguage,
      signal,
    }) {
      return transport.request(
        {
          path: '/api/v1/feed/pods',
          query: {
            ...(cursor ? { cursor } : {}),
            limit,
            session_id: installationId,
            ...(excludeSeen ? { exclude_seen: true } : {}),
            ...(contentLanguage ? { content_language: contentLanguage } : {}),
          },
          signal,
          authenticated: true,
        },
        podsFeedResponseSchema,
      );
    },
    createPodsSession({
      installationId,
      limit = 10,
      signal,
      contentLanguage,
      duration,
    }) {
      return transport.request(
        {
          path: '/api/v1/feed/pods/sessions',
          method: 'POST',
          query: {
            limit,
            session_id: installationId,
            ...(contentLanguage ? { content_language: contentLanguage } : {}),
            ...(duration ? { duration } : {}),
          },
          signal,
          timeoutMs: podsSessionCreationTimeoutMs,
          authenticated: true,
        },
        podsSessionResponseSchema,
      );
    },
    getPodsSessionPage({
      installationId,
      sessionId,
      cursor,
      limit = 10,
      signal,
    }) {
      return transport.request(
        {
          path: `/api/v1/feed/pods/sessions/${sessionId}`,
          query: {
            ...(cursor ? { cursor } : {}),
            limit,
            session_id: installationId,
          },
          signal,
          authenticated: true,
        },
        podsSessionResponseSchema,
      );
    },
    getPodsSessionFreshness({
      installationId,
      sessionId,
      signal,
      duration,
      contentLanguage,
    }) {
      return transport.request(
        {
          path: `/api/v1/feed/pods/sessions/${sessionId}/freshness`,
          query: {
            session_id: installationId,
            ...(duration ? { duration } : {}),
            ...(contentLanguage ? { content_language: contentLanguage } : {}),
          },
          signal,
          authenticated: true,
        },
        podsSessionFreshnessResponseSchema,
      );
    },
    getComments({ contentId, installationId, cursor, limit = 20, signal }) {
      return transport.request(
        {
          path: `/api/v1/content/${contentId}/comments`,
          query: {
            ...(cursor ? { cursor } : {}),
            limit,
            session_id: installationId,
          },
          signal,
          authenticated: true,
        },
        commentsResponseSchema,
      );
    },
    getTranscript(transcriptId, signal) {
      return transport.request(
        {
          path: `/api/v1/transcripts/${transcriptId}`,
          signal,
          authenticated: true,
        },
        transcriptResponseSchema,
      );
    },
    requestTranscription(contentId, signal) {
      return transport.request(
        {
          method: 'POST',
          path: `/api/v1/content/${contentId}/transcribe`,
          signal,
          authenticated: true,
        },
        transcriptionRequestResponseSchema,
      );
    },
    async createInteraction({
      contentId,
      type,
      sessionId,
      idempotencyKey,
      metadata,
      signal,
    }) {
      interactionTypeSchema.parse(type);
      await transport.request(
        {
          path: '/api/v1/interactions',
          method: 'POST',
          body: {
            content_item_id: contentId,
            interaction_type: type,
            session_id: sessionId,
            ...(metadata ? { metadata } : {}),
          },
          idempotencyKey,
          signal,
          authenticated: true,
        },
        interactionResponseSchema,
      );
    },
    async deleteInteraction({ contentId, type, sessionId, signal }) {
      try {
        await transport.request(
          {
            path: '/api/v1/interactions',
            method: 'DELETE',
            query: {
              content_item_id: contentId,
              type,
              session_id: sessionId,
            },
            signal,
            authenticated: true,
          },
          interactionResponseSchema,
        );
      } catch (error) {
        // A replayed deletion has reached its desired server state when the
        // interaction is already absent. Treat that particular 404 as an ack.
        if (error instanceof HttpError && error.context.status === 404) {
          return;
        }
        throw error;
      }
    },
    async deleteComment(commentId, sessionId) {
      try {
        await transport.request(
          {
            path: `/api/v1/interactions/${commentId}`,
            method: 'DELETE',
            query: { session_id: sessionId },
            authenticated: true,
          },
          interactionResponseSchema,
        );
      } catch (error) {
        if (error instanceof HttpError && error.context.status === 404) {
          return;
        }
        throw error;
      }
    },
    getSavedContent({
      cursor,
      limit = 20,
      sort = 'saved_desc',
      feed = 'all',
      installationId,
      q,
      signal,
    }) {
      return transport.request(
        {
          path: '/api/v1/interactions/bookmarks',
          query: {
            ...(cursor ? { cursor } : {}),
            ...(installationId ? { session_id: installationId } : {}),
            ...(q?.trim() ? { q: q.trim() } : {}),
            limit,
            sort,
            feed,
          },
          signal,
          authenticated: true,
        },
        savedContentResponseSchema,
      );
    },
    getLikedContent({ cursor, limit = 20, signal }) {
      return transport.request(
        {
          path: '/api/v1/interactions/likes',
          query: { ...(cursor ? { cursor } : {}), limit },
          signal,
          authenticated: true,
        },
        likedContentResponseSchema,
      );
    },
    getProfileStats(signal) {
      return transport.request(
        { path: '/api/v1/interactions/stats', signal, authenticated: true },
        profileStatsResponseSchema,
      );
    },
    getMyContent({ type, cursor, limit = 20, signal }) {
      return transport.request(
        {
          path: '/api/v1/content/mine',
          query: { ...(cursor ? { cursor } : {}), limit, type },
          signal,
          authenticated: true,
        },
        myContentResponseSchema,
      );
    },
    getHistory({ installationId, cursor, limit = 20, signal }) {
      return transport.request(
        {
          path: '/api/v1/interactions/history',
          query: {
            ...(cursor ? { cursor } : {}),
            limit,
            session_id: installationId,
          },
          signal,
          authenticated: true,
        },
        historyResponseSchema,
      );
    },
    async clearHistory(sessionId) {
      await transport.request(
        {
          path: '/api/v1/interactions/history',
          method: 'DELETE',
          query: { session_id: sessionId },
          authenticated: true,
        },
        interactionResponseSchema,
      );
    },
    getTopicPicker(signal) {
      return transport.request(
        { path: '/api/v1/topics/picker', signal, authenticated: true },
        topicPickerResponseSchema,
      );
    },
    getPreferences(signal) {
      return transport.request(
        { path: '/api/v1/preferences', signal, authenticated: true },
        preferencesResponseSchema,
      );
    },
    updateDeclaredTopics(topicIds) {
      return transport.request(
        {
          path: '/api/v1/preferences/topics',
          method: 'PUT',
          body: { topic_ids: topicIds },
          authenticated: true,
        },
        preferencesResponseSchema,
      );
    },
    muteTopic(topicId) {
      return transport.request(
        {
          path: `/api/v1/preferences/topics/${topicId}/mute`,
          method: 'POST',
          authenticated: true,
        },
        preferencesResponseSchema,
      );
    },
    unmuteTopic(topicId) {
      return transport.request(
        {
          path: `/api/v1/preferences/topics/${topicId}/mute`,
          method: 'DELETE',
          authenticated: true,
        },
        preferencesResponseSchema,
      );
    },
    async muteSource(contentId) {
      await transport.request(
        {
          path: `/api/v1/preferences/sources/${contentId}/mute`,
          method: 'POST',
          authenticated: true,
        },
        sourcePreferenceResponseSchema,
      );
    },
    async unmuteSource(sourceKey) {
      await transport.request(
        {
          path: '/api/v1/preferences/sources/mute',
          method: 'DELETE',
          query: { source_key: sourceKey },
          authenticated: true,
        },
        sourcePreferenceResponseSchema,
      );
    },
    async reportModeration({
      targetType,
      targetId,
      reason,
      detail,
      installationId,
      idempotencyKey,
    }) {
      moderationReasonSchema.parse(reason);
      await transport.request(
        {
          path: '/api/v1/moderation/reports',
          method: 'POST',
          query: { installation_id: installationId },
          authenticated: true,
          idempotencyKey,
          body: {
            target_type: targetType,
            target_id: targetId,
            reason,
            ...(detail ? { detail } : {}),
          },
        },
        moderationReportResponseSchema,
      );
    },
    async blockAuthor(authorId) {
      await transport.request(
        {
          path: '/api/v1/moderation/blocks',
          method: 'POST',
          authenticated: true,
          body: { author_id: authorId },
        },
        interactionResponseSchema,
      );
    },
    async unblockAuthor(authorId) {
      await transport.request(
        {
          path: `/api/v1/moderation/blocks/${authorId}`,
          method: 'DELETE',
          authenticated: true,
        },
        interactionResponseSchema,
      );
    },
  };
}
