import {
  commentsResponseSchema,
  forYouFeedResponseSchema,
  forYouSessionResponseSchema,
  interactionResponseSchema,
  interactionTypeSchema,
  transcriptResponseSchema,
  type ForYouFeedResponse,
  type ForYouSessionResponse,
  type InteractionType,
  type CommentsResponse,
  type Transcript,
} from './schemas';
import type { Transport } from './transport';

export type ForYouPageRequest = {
  cursor?: string;
  limit?: number;
  installationId: string;
  excludeSeen?: boolean;
  signal?: AbortSignal;
};

export type CmsApi = {
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
};

export type CreateInteractionRequest = {
  contentId: string;
  type: InteractionType;
  sessionId: string;
  idempotencyKey: string;
  metadata?: Record<string, unknown>;
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

export function createCmsApi(transport: Transport): CmsApi {
  return {
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
        },
        commentsResponseSchema,
      );
    },
    getTranscript(transcriptId, signal) {
      return transport.request(
        { path: `/api/v1/transcripts/${transcriptId}`, signal },
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
        },
        interactionResponseSchema,
      );
    },
  };
}
