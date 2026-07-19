import type { ZodType } from 'zod';

import {
  ContractError,
  HttpError,
  NetworkError,
  type RequestContext,
} from './errors';

export type QueryValue = string | number | boolean | null | undefined;

export type RequestOptions = {
  path: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  query?: Record<string, QueryValue>;
  body?: unknown;
  authenticated?: boolean;
  signal?: AbortSignal;
  timeoutMs?: number;
};

export type AccessTokenProvider = () => Promise<string | null> | string | null;
export type FetchImplementation = typeof fetch;

export type TransportOptions = {
  baseUrl: string;
  getAccessToken?: AccessTokenProvider;
  fetchImplementation?: FetchImplementation;
  defaultTimeoutMs?: number;
};

export type Transport = {
  request<T>(options: RequestOptions, schema: ZodType<T>): Promise<T>;
};

const defaultTimeoutMs = 12_000;

function buildUrl(
  baseUrl: string,
  path: string,
  query?: Record<string, QueryValue>,
): URL {
  const url = new URL(path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);

  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }

  return url;
}

function toRequestContext(
  method: string,
  url: URL,
  status?: number,
): RequestContext {
  return {
    method,
    path: url.pathname,
    ...(status === undefined ? {} : { status }),
  };
}

function createRequestSignal(
  signal: AbortSignal | undefined,
  timeoutMs: number,
) {
  const controller = new AbortController();
  let timedOut = false;
  const abortFromCaller = () => controller.abort();
  signal?.addEventListener('abort', abortFromCaller, { once: true });
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);

  return {
    signal: controller.signal,
    didTimeOut: () => timedOut,
    dispose: () => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', abortFromCaller);
    },
  };
}

export function createTransport(options: TransportOptions): Transport {
  const fetchImplementation = options.fetchImplementation ?? fetch;

  return {
    async request<T>(
      requestOptions: RequestOptions,
      schema: ZodType<T>,
    ): Promise<T> {
      const method = requestOptions.method ?? 'GET';
      const url = buildUrl(
        options.baseUrl,
        requestOptions.path,
        requestOptions.query,
      );
      const context = toRequestContext(method, url);
      const requestSignal = createRequestSignal(
        requestOptions.signal,
        requestOptions.timeoutMs ??
          options.defaultTimeoutMs ??
          defaultTimeoutMs,
      );

      try {
        const headers = new Headers({ Accept: 'application/json' });
        if (requestOptions.body !== undefined) {
          headers.set('Content-Type', 'application/json');
        }

        if (requestOptions.authenticated) {
          const token = await options.getAccessToken?.();
          if (token) {
            headers.set('Authorization', `Bearer ${token}`);
          }
        }

        const response = await fetchImplementation(url, {
          method,
          headers,
          ...(requestOptions.body === undefined
            ? {}
            : { body: JSON.stringify(requestOptions.body) }),
          signal: requestSignal.signal,
        });

        if (!response.ok) {
          throw new HttpError(toRequestContext(method, url, response.status));
        }

        let payload: unknown;
        try {
          payload = await response.json();
        } catch {
          throw new ContractError(context, 1);
        }

        const parsed = schema.safeParse(payload);
        if (!parsed.success) {
          throw new ContractError(context, parsed.error.issues.length);
        }

        return parsed.data;
      } catch (error) {
        if (error instanceof HttpError || error instanceof ContractError) {
          throw error;
        }

        if (requestSignal.didTimeOut()) {
          throw new NetworkError('Request timed out.', context, {
            cause: error,
          });
        }

        if (requestOptions.signal?.aborted) {
          throw new NetworkError('Request cancelled.', context, {
            cause: error,
          });
        }

        throw new NetworkError('Unable to reach the service.', context, {
          cause: error,
        });
      } finally {
        requestSignal.dispose();
      }
    },
  };
}
