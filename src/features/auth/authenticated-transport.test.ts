import { describe, expect, it } from '@jest/globals';
import { z } from 'zod';

import { HttpError } from '@/core/api';
import type { Transport } from '@/core/api';

import { createAuthenticatedTransport } from './authenticated-transport';

describe('authenticated transport', () => {
  it('retries an authenticated request once after a 401', async () => {
    let requests = 0;
    let refreshes = 0;
    const base: Transport = {
      request: async <T>() => {
        requests += 1;
        if (requests === 1) {
          throw new HttpError({ method: 'GET', path: '/private', status: 401 });
        }
        return { ready: true } as T;
      },
    };
    const session = {
      refresh: async () => {
        refreshes += 1;
        return 'fresh-access-token';
      },
    };
    const transport = createAuthenticatedTransport(base, session as never);

    await expect(
      transport.request(
        { authenticated: true, path: '/private' },
        z.object({ ready: z.boolean() }),
      ),
    ).resolves.toEqual({ ready: true });
    expect(refreshes).toBe(1);
  });
});
