import {
  commentsResponseSchema,
  forYouFeedResponseSchema,
  forYouSessionResponseSchema,
  forYouSessionFreshnessResponseSchema,
  interactionResponseSchema,
  moderationReasonSchema,
  moderationReportResponseSchema,
  interactionTypeSchema,
  historyResponseSchema,
  preferencesResponseSchema,
  sourcePreferenceResponseSchema,
  savedContentResponseSchema,
  topicPickerResponseSchema,
  articleContentResponseSchema,
  newsFeedResponseSchema,
  transcriptResponseSchema,
  type ForYouFeedResponse,
  type ForYouSessionResponse,
  type ForYouSessionFreshnessResponse,
  type InteractionType,
  type ArticleContent,
  type NewsFeedResponse,
  type CommentsResponse,
  type Transcript,
  type HistoryResponse,
  type PreferencesResponse,
  type SavedContentResponse,
  type TopicPickerResponse,
  type ModerationReason,
} from './schemas';
import type { Transport } from './transport';
import { HttpError } from './errors';

export type ForYouPageRequest = {
  cursor?: string;
  limit?: number;
  installationId: string;
  excludeSeen?: boolean;
  contentLanguage?: 'ar' | 'en' | 'both';
  signal?: AbortSignal;
};

export type CmsApi = {
  getArticleContent(id: string, signal?: AbortSignal): Promise<ArticleContent>;
  getNewsPage(request: NewsPageRequest): Promise<NewsFeedResponse>;
  getForYouPage(request: ForYouPageRequest): Promise<ForYouFeedResponse>;
  createForYouSession(
    request: ForYouSessionRequest,
  ): Promise<ForYouSessionResponse>;
  getForYouSessionPage(
    request: ForYouSessionPageRequest,
  ): Promise<ForYouSessionResponse>;
  getForYouSessionFreshness(
    request: ForYouSessionFreshnessRequest,
  ): Promise<ForYouSessionFreshnessResponse>;
  getComments(request: CommentsRequest): Promise<CommentsResponse>;
  getTranscript(
    transcriptId: string,
    signal?: AbortSignal,
  ): Promise<Transcript>;
  createInteraction(request: CreateInteractionRequest): Promise<void>;
  deleteInteraction(request: DeleteInteractionRequest): Promise<void>;
  deleteComment(commentId: string, sessionId: string): Promise<void>;
  getSavedContent(request: SavedContentRequest): Promise<SavedContentResponse>;
  getHistory(request: HistoryRequest): Promise<HistoryResponse>;
  clearHistory(sessionId: string): Promise<void>;
  getTopicPicker(signal?: AbortSignal): Promise<TopicPickerResponse>;
  getPreferences(signal?: AbortSignal): Promise<PreferencesResponse>;
  updateDeclaredTopics(topicIds: string[]): Promise<PreferencesResponse>;
  muteSource(contentId: string): Promise<void>;
  unmuteSource(sourceKey: string): Promise<void>;
  reportModeration(request: ModerationReportRequest): Promise<void>;
  blockAuthor(authorId: string): Promise<void>;
  unblockAuthor(authorId: string): Promise<void>;
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

export type ForYouSessionRequest = {
  installationId: string;
  limit?: number;
  signal?: AbortSignal;
  contentLanguage?: 'ar' | 'en' | 'both';
};

export type ForYouSessionPageRequest = ForYouSessionRequest & {
  sessionId: string;
  cursor?: string;
};

export type ForYouSessionFreshnessRequest = Pick<
  ForYouSessionRequest,
  'installationId' | 'signal'
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
  feed?: 'all' | 'foryou' | 'news';
  signal?: AbortSignal;
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
    getArticleContent(id, signal) {
      return transport.request(
        { path: `/api/v1/content/${id}`, signal, authenticated: true },
        articleContentResponseSchema,
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
    getForYouPage({
      cursor,
      limit = 10,
      installationId,
      excludeSeen = false,
      contentLanguage,
      signal,
    }) {
      return transport.request(
        {
          path: '/api/v1/feed/foryou',
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
        forYouFeedResponseSchema,
      );
    },
    createForYouSession({
      installationId,
      limit = 10,
      signal,
      contentLanguage,
    }) {
      return transport.request(
        {
          path: '/api/v1/feed/foryou/sessions',
          method: 'POST',
          query: {
            limit,
            session_id: installationId,
            ...(contentLanguage ? { content_language: contentLanguage } : {}),
          },
          signal,
          authenticated: true,
        },
        forYouSessionResponseSchema,
      );
    },
    getForYouSessionPage({
      installationId,
      sessionId,
      cursor,
      limit = 10,
      signal,
    }) {
      return transport.request(
        {
          path: `/api/v1/feed/foryou/sessions/${sessionId}`,
          query: {
            ...(cursor ? { cursor } : {}),
            limit,
            session_id: installationId,
          },
          signal,
          authenticated: true,
        },
        forYouSessionResponseSchema,
      );
    },
    getForYouSessionFreshness({ installationId, sessionId, signal }) {
      return transport.request(
        {
          path: `/api/v1/feed/foryou/sessions/${sessionId}/freshness`,
          query: { session_id: installationId },
          signal,
          authenticated: true,
        },
        forYouSessionFreshnessResponseSchema,
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
      signal,
    }) {
      return transport.request(
        {
          path: '/api/v1/interactions/bookmarks',
          query: { ...(cursor ? { cursor } : {}), limit, sort, feed },
          signal,
          authenticated: true,
        },
        savedContentResponseSchema,
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
