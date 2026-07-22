import { describe, expect, it } from '@jest/globals';
import type { ZodType } from 'zod';

import { createCmsApi } from './cms';
import type { RequestOptions, Transport } from './transport';

describe('CMS history contract', () => {
  it('carries the installation identity for anonymous History reads', async () => {
    let captured: RequestOptions | undefined;
    const transport: Transport = {
      request: async <T>(options: RequestOptions, schema: ZodType<T>) => {
        captured = options;
        return schema.parse({ cursor: null, items: [] });
      },
    };

    await expect(
      createCmsApi(transport).getHistory({
        installationId: 'install-history-1',
      }),
    ).resolves.toEqual({ cursor: null, items: [] });

    expect(captured).toMatchObject({
      path: '/api/v1/interactions/history',
      authenticated: true,
      query: { limit: 20, session_id: 'install-history-1' },
    });
  });
});

describe('CMS For You freshness contract', () => {
  it('checks a frozen session without creating or replacing it', async () => {
    let captured: RequestOptions | undefined;
    const transport: Transport = {
      request: async <T>(options: RequestOptions, schema: ZodType<T>) => {
        captured = options;
        return schema.parse({ has_new_content: true });
      },
    };

    await expect(
      createCmsApi(transport).getForYouSessionFreshness({
        installationId: 'install-freshness-1',
        sessionId: 'b4a7e91c-9227-4c51-9fa8-9955e1e4c139',
      }),
    ).resolves.toEqual({ hasNewContent: true });

    expect(captured).toMatchObject({
      path: '/api/v1/feed/foryou/sessions/b4a7e91c-9227-4c51-9fa8-9955e1e4c139/freshness',
      query: { session_id: 'install-freshness-1' },
    });
  });
});

describe('CMS For You delivery-language contract', () => {
  it('sends the explicit delivery preference only when creating a frozen session', async () => {
    let captured: RequestOptions | undefined;
    const transport: Transport = {
      request: async <T>(options: RequestOptions, schema: ZodType<T>) => {
        captured = options;
        return schema.parse({
          session_id: 'b4a7e91c-9227-4c51-9fa8-9955e1e4c139',
          server_session_id: 'b4a7e91c-9227-4c51-9fa8-9955e1e4c139',
          cursor: null,
          expires_at: '2026-07-22T12:00:00.000Z',
          items: [],
        });
      },
    };

    await createCmsApi(transport).createForYouSession({
      installationId: 'install-language-1',
      contentLanguage: 'ar',
    });

    expect(captured).toMatchObject({
      path: '/api/v1/feed/foryou/sessions',
      method: 'POST',
      query: {
        limit: 10,
        session_id: 'install-language-1',
        content_language: 'ar',
      },
    });
  });

  it('keeps the direct-feed language filter available for non-session consumers', async () => {
    let captured: RequestOptions | undefined;
    const transport: Transport = {
      request: async <T>(options: RequestOptions, schema: ZodType<T>) => {
        captured = options;
        return schema.parse({ cursor: null, items: [] });
      },
    };

    await createCmsApi(transport).getForYouPage({
      installationId: 'install-language-1',
      contentLanguage: 'both',
    });

    expect(captured?.query).toMatchObject({ content_language: 'both' });
  });
});

describe('CMS source preference contract', () => {
  it('derives the muted source on the server from a content ID', async () => {
    let captured: RequestOptions | undefined;
    const transport: Transport = {
      request: async <T>(options: RequestOptions, schema: ZodType<T>) => {
        captured = options;
        return schema.parse({ source_key: 'feed:example.com', state: 'muted' });
      },
    };

    await expect(
      createCmsApi(transport).muteSource(
        'b4a7e91c-9227-4c51-9fa8-9955e1e4c139',
      ),
    ).resolves.toBeUndefined();

    expect(captured).toMatchObject({
      path: '/api/v1/preferences/sources/b4a7e91c-9227-4c51-9fa8-9955e1e4c139/mute',
      method: 'POST',
      authenticated: true,
    });
  });

  it('restores a muted source by its server-returned preference key', async () => {
    let captured: RequestOptions | undefined;
    const transport: Transport = {
      request: async <T>(options: RequestOptions, schema: ZodType<T>) => {
        captured = options;
        return schema.parse({
          source_key: 'feed:example.com',
          state: 'active',
        });
      },
    };

    await expect(
      createCmsApi(transport).unmuteSource('feed:example.com'),
    ).resolves.toBeUndefined();
    expect(captured).toMatchObject({
      path: '/api/v1/preferences/sources/mute',
      method: 'DELETE',
      query: { source_key: 'feed:example.com' },
      authenticated: true,
    });
  });
});
