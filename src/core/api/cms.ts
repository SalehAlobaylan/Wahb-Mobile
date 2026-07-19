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
import { HttpError } from './errors';

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
  deleteInteraction(request: DeleteInteractionRequest): Promise<void>;
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
  };
}
