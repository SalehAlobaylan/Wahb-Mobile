import { forYouFeedResponseSchema, type ForYouFeedResponse } from './schemas';
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
  };
}
