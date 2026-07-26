import { describe, expect, it } from '@jest/globals';
import { z } from 'zod';

import { ContractError, HttpError } from './errors';
import { createTransport } from './transport';

describe('transport', () => {
  it('uses direct CMS requests, validates the response, and never puts identity in headers', async () => {
    const fetchImplementation: typeof fetch = async (
      input: RequestInfo | URL,
      init?: RequestInit,
    ) => {
      expect(String(input)).toContain(
        '/api/v1/feed/foryou?session_id=install-1',
      );
      expect(new Headers(init?.headers).get('Authorization')).toBeNull();
      return new Response(JSON.stringify({ ready: true }), { status: 200 });
    };
    const transport = createTransport({
      baseUrl: 'https://cms.example.test',
      fetchImplementation,
    });

    await expect(
      transport.request(
        { path: '/api/v1/feed/foryou', query: { session_id: 'install-1' } },
        z.object({ ready: z.boolean() }),
      ),
    ).resolves.toEqual({ ready: true });
  });

  it('redacts malformed responses behind a contract error', async () => {
    const transport = createTransport({
      baseUrl: 'https://cms.example.test',
      fetchImplementation: async () =>
        new Response(JSON.stringify({ ready: 'yes' })),
    });

    await expect(
      transport.request(
        { path: '/api/v1/feed/foryou' },
        z.object({ ready: z.boolean() }),
      ),
    ).rejects.toBeInstanceOf(ContractError);
  });

  it('does not expose an HTTP response body on server failure', async () => {
    const transport = createTransport({
      baseUrl: 'https://cms.example.test',
      fetchImplementation: async () =>
        new Response(JSON.stringify({ token: 'must-not-leak' }), {
          status: 500,
        }),
    });

    await expect(
      transport.request(
        { path: '/api/v1/feed/foryou' },
        z.object({ ready: z.boolean() }),
      ),
    ).rejects.toBeInstanceOf(HttpError);
  });

  it('sends raw FormData without a manually supplied multipart boundary', async () => {
    const formData = new FormData();
    formData.append('avatar', 'image-data');
    const transport = createTransport({
      baseUrl: 'https://iam.example.test',
      getAccessToken: () => 'access-token',
      fetchImplementation: async (_input, init) => {
        expect(init?.body).toBe(formData);
        expect(new Headers(init?.headers).get('Content-Type')).toBeNull();
        expect(new Headers(init?.headers).get('Authorization')).toBe(
          'Bearer access-token',
        );
        return new Response(JSON.stringify({ uploaded: true }), {
          status: 200,
        });
      },
    });

    await expect(
      transport.request(
        {
          path: '/api/v1/users/avatar',
          method: 'POST',
          formData,
          authenticated: true,
        },
        z.object({ uploaded: z.literal(true) }),
      ),
    ).resolves.toEqual({ uploaded: true });
  });
});
