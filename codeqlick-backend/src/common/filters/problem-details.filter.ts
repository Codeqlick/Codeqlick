import {
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { STATUS_CODES } from 'node:http';
import type { Response } from 'express';
import type { AppRequest } from '../types/request.js';

export interface ProblemFieldError {
  path: string;
  message: string;
}

/** RFC 9457 problem details body (architecture section 4.4). */
export interface ProblemDetails {
  type: string;
  title: string;
  status: number;
  detail?: string;
  instance: string;
  errors?: ProblemFieldError[];
  requestId?: string;
  [extension: string]: unknown;
}

/**
 * Global catch-all filter. Every error leaves the API as `application/problem+json`.
 * Unknown errors become a generic 500; their stack goes to the logs with the request id.
 */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ProblemDetailsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<AppRequest>();
    const response = http.getResponse<Response>();
    const requestId = request.id === undefined ? undefined : String(request.id);

    const problem = this.toProblem(exception);
    problem.instance = request.originalUrl ?? request.url;
    if (requestId) problem.requestId = requestId;

    if (problem.status >= 500) {
      const err = exception instanceof Error ? exception : new Error(String(exception));
      this.logger.error(
        `Unhandled error on ${request.method} ${problem.instance} (requestId=${requestId ?? 'n/a'}): ${err.message}`,
        err.stack,
      );
    }

    if (response.headersSent) return;
    response.status(problem.status).type('application/problem+json').json(problem);
  }

  private toProblem(exception: unknown): ProblemDetails {
    if (exception instanceof HttpException) {
      return fromHttpException(exception);
    }
    const prismaCode = getPrismaErrorCode(exception);
    if (prismaCode === 'P2002') {
      const target = getPrismaTarget(exception);
      return {
        ...base(HttpStatus.CONFLICT),
        detail: 'Already exists',
        ...(target.length > 0 ? { target } : {}),
      };
    }
    if (prismaCode === 'P2025') {
      return { ...base(HttpStatus.NOT_FOUND), detail: 'Resource not found' };
    }
    if (prismaCode === 'P2003') {
      return { ...base(HttpStatus.CONFLICT), detail: 'Resource is referenced by other records' };
    }
    // Errors raised by Express middleware before Nest (e.g. malformed JSON, payload too large)
    // carry a 4xx `status` and `expose: true`.
    const clientError = getExposedClientError(exception);
    if (clientError) {
      return { ...base(clientError.status), detail: clientError.message };
    }
    return { ...base(HttpStatus.INTERNAL_SERVER_ERROR), detail: 'An unexpected error occurred' };
  }
}

function base(status: number): ProblemDetails {
  return {
    type: 'about:blank',
    title: STATUS_CODES[status] ?? 'Error',
    status,
    instance: '',
  };
}

function fromHttpException(exception: HttpException): ProblemDetails {
  const status = exception.getStatus();
  const problem = base(status);
  const body = exception.getResponse();

  if (typeof body === 'string') {
    problem.detail = body;
    return problem;
  }
  if (!isRecord(body)) {
    problem.detail = exception.message;
    return problem;
  }

  // The validation pipe's exact body shape is not part of our contract, so collect issues from
  // any array-valued property (`errors`, `issues`, `message`, ...).
  const errors = Object.values(body).flatMap((value) => normalizeIssues(value));

  if (errors.length > 0) {
    // Field-level validation errors (Standard Schema pipe or our own).
    problem.detail = 'Validation failed';
    problem.errors = errors;
  } else if (typeof body.message === 'string') {
    problem.detail = body.message;
  } else if (typeof body.detail === 'string') {
    problem.detail = body.detail;
  } else {
    problem.detail = exception.message;
  }
  return problem;
}

/** Accepts Standard Schema issues, `{ path, message }` objects, or plain strings. */
function normalizeIssues(value: unknown): ProblemFieldError[] {
  if (!Array.isArray(value)) return [];
  const out: ProblemFieldError[] = [];
  for (const item of value) {
    if (typeof item === 'string') {
      out.push({ path: '', message: item });
      continue;
    }
    if (!isRecord(item) || typeof item.message !== 'string') continue;
    out.push({ path: formatPath(item.path), message: item.message });
  }
  return out;
}

function formatPath(path: unknown): string {
  if (typeof path === 'string') return path;
  if (!Array.isArray(path)) return '';
  return path
    .map((segment: unknown) => {
      if (isRecord(segment) && 'key' in segment) return String(segment.key as PropertyKey);
      return String(segment as PropertyKey);
    })
    .join('.');
}

function getPrismaErrorCode(exception: unknown): string | undefined {
  if (!isRecord(exception)) return undefined;
  const name = exception.name;
  const code = exception.code;
  if (name === 'PrismaClientKnownRequestError' && typeof code === 'string') return code;
  return undefined;
}

function getPrismaTarget(exception: unknown): string[] {
  if (!isRecord(exception) || !isRecord(exception.meta)) return [];
  const meta = exception.meta;
  const target = meta.target;
  if (Array.isArray(target)) return target.map(String);
  if (typeof target === 'string') return [target];
  // Driver adapters report the constraint fields under meta.driverAdapterError.cause.constraint.
  const adapterError = meta.driverAdapterError;
  if (isRecord(adapterError) && isRecord(adapterError.cause)) {
    const constraint = adapterError.cause.constraint;
    if (isRecord(constraint) && Array.isArray(constraint.fields)) {
      return constraint.fields.map(String);
    }
  }
  return [];
}

function getExposedClientError(
  exception: unknown,
): { status: number; message: string } | undefined {
  if (!isRecord(exception) || exception.expose !== true) return undefined;
  const status = typeof exception.status === 'number' ? exception.status : exception.statusCode;
  if (typeof status !== 'number' || status < 400 || status > 499) return undefined;
  const message = typeof exception.message === 'string' ? exception.message : 'Bad request';
  return { status, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
