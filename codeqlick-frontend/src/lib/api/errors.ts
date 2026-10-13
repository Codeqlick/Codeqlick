import type { ProblemDetails, ProblemFieldError } from './types';

/**
 * Error thrown by `apiFetch` for any non-2xx response (built from the RFC 9457 problem+json body)
 * and for network failures (status 503, "API unreachable").
 *
 * This module has no `server-only` marker so `isApiError` can be shared, but it is only ever
 * instantiated on the server.
 */
export class ApiError extends Error {
  readonly status: number;
  readonly title: string;
  readonly detail: string | undefined;
  readonly errors: ProblemFieldError[];
  readonly requestId: string | undefined;

  constructor(status: number, problem: ProblemDetails = {}) {
    const title = problem.title ?? `HTTP ${status}`;
    super(problem.detail ? `${title}: ${problem.detail}` : title);
    this.name = 'ApiError';
    this.status = status;
    this.title = title;
    this.detail = problem.detail;
    this.errors = Array.isArray(problem.errors) ? problem.errors : [];
    this.requestId = problem.requestId;
  }

  /** Field errors keyed by their top-level path (`translations.0.title` → `translations.0.title`). */
  get fieldErrors(): Record<string, string> {
    const result: Record<string, string> = {};
    for (const error of this.errors) {
      const key = error.path || '_form';
      if (!(key in result)) result[key] = error.message;
    }
    return result;
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function isNotFound(error: unknown): boolean {
  return isApiError(error) && error.status === 404;
}
