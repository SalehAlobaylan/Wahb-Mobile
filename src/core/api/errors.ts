export type RequestContext = {
  method: string;
  path: string;
  status?: number;
};

export class ApiError extends Error {
  readonly context: RequestContext;

  constructor(
    message: string,
    context: RequestContext,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ApiError';
    this.context = context;
  }
}

export class NetworkError extends ApiError {
  constructor(
    message: string,
    context: RequestContext,
    options?: ErrorOptions,
  ) {
    super(message, context, options);
    this.name = 'NetworkError';
  }
}

export class HttpError extends ApiError {
  constructor(context: RequestContext) {
    super(`Request failed with HTTP ${context.status ?? 'unknown'}.`, context);
    this.name = 'HttpError';
  }
}

export class ContractError extends ApiError {
  readonly issueCount: number;

  constructor(context: RequestContext, issueCount: number) {
    super('The server response did not satisfy the mobile contract.', context);
    this.name = 'ContractError';
    this.issueCount = issueCount;
  }
}

/**
 * This deliberately exposes only route-level metadata. Callers must never send
 * raw response bodies, headers, query strings, signed URLs, or credentials to
 * diagnostics.
 */
export function toDiagnosticErrorContext(
  error: unknown,
): Record<string, unknown> {
  if (error instanceof ApiError) {
    return {
      error_name: error.name,
      method: error.context.method,
      path: error.context.path,
      status: error.context.status,
      ...(error instanceof ContractError
        ? { issue_count: error.issueCount }
        : {}),
    };
  }

  return { error_name: error instanceof Error ? error.name : 'UnknownError' };
}
