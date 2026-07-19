import type { ZodType } from 'zod';

import { HttpError } from '@/core/api/errors';
import type { RequestOptions, Transport } from '@/core/api/transport';

import type { AuthSessionManager } from './auth-session';

/** Retries one authenticated request after the manager's single-flight rotation. */
export function createAuthenticatedTransport(
  transport: Transport,
  session: AuthSessionManager,
): Transport {
  return {
    async request<T>(options: RequestOptions, schema: ZodType<T>): Promise<T> {
      try {
        return await transport.request(options, schema);
      } catch (error) {
        if (
          !options.authenticated ||
          !(error instanceof HttpError) ||
          error.context.status !== 401
        ) {
          throw error;
        }
        const nextToken = await session.refresh();
        if (!nextToken) {
          throw error;
        }
        return transport.request(options, schema);
      }
    },
  };
}
