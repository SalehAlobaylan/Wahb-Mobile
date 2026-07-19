import {
  commentsResponseSchema,
  forYouFeedResponseSchema,
  forYouSessionResponseSchema,
  interactionResponseSchema,
  interactionTypeSchema,
  historyResponseSchema,
  preferencesResponseSchema,
  savedContentResponseSchema,
  topicPickerResponseSchema,
  articleContentResponseSchema,
  newsFeedResponseSchema,
  transcriptResponseSchema,
  type ForYouFeedResponse,
  type ForYouSessionResponse,
  type InteractionType,
  type ArticleContent,
  type NewsFeedResponse,
  type CommentsResponse,
  type Transcript,
  type HistoryResponse,
  type PreferencesResponse,
  type SavedContentResponse,
  type TopicPickerResponse,
} from './schemas';
import type { Transport } from './transport';
import { HttpError } from './errors';

export type ForYouPageRequest = {
  cursor?: string;
  limit?: number;
  installationId: string;
  excludeSeen?: boolean;
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
  getComments(request: CommentsRequest): Promise<CommentsResponse>;
  getTranscript(
    transcriptId: string,
    signal?: AbortSignal,
  ): Promise<Transcript>;
  createInteraction(request: CreateInteractionRequest): Promise<void>;
  deleteInteraction(request: DeleteInteractionRequest): Promise<void>;
  getSavedContent(request: SavedContentRequest): Promise<SavedContentResponse>;
  getHistory(request: HistoryRequest): Promise<HistoryResponse>;
  clearHistory(sessionId: string): Promise<void>;
  getTopicPicker(signal?: AbortSignal): Promise<TopicPickerResponse>;
  getPreferences(signal?: AbortSignal): Promise<PreferencesResponse>;
  updateDeclaredTopics(topicIds: string[]): Promise<PreferencesResponse>;
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
};

export type ForYouSessionPageRequest = ForYouSessionRequest & {
  sessionId: string;
  cursor?: string;
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
  cursor?: string;
  limit?: number;
  signal?: AbortSignal;
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
          },
          signal,
          authenticated: true,
        },
        forYouFeedResponseSchema,
      );
    },
    createForYouSession({ installationId, limit = 10, signal }) {
      return transport.request(
        {
          path: '/api/v1/feed/foryou/sessions',
          method: 'POST',
          query: { limit, session_id: installationId },
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
        { path: `/api/v1/transcripts/${transcriptId}`, signal, authenticated: true },
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
    getSavedContent({ cursor, limit = 20, sort = 'saved_desc', feed = 'all', signal }) {
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
    getHistory({ cursor, limit = 20, signal }) {
      return transport.request(
        {
          path: '/api/v1/interactions/history',
          query: { ...(cursor ? { cursor } : {}), limit },
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
  };
}
