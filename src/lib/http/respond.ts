/**
 * HTTP response shape and error mapping.
 *
 * One place decides what reaches a client. Internal detail — stack traces,
 * database messages, upstream bodies — stays in the server log; the client gets
 * a code it can branch on and a message safe to show a person.
 */

import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { AppError, RateLimitError, isAppError } from '../errors';
import { redactSecrets } from '../paystack/client';

export interface ErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export function ok<T>(data: T, init?: ResponseInit): NextResponse {
  return NextResponse.json({ data }, { status: 200, ...init });
}

export function created<T>(data: T, location?: string): NextResponse {
  return NextResponse.json(
    { data },
    { status: 201, headers: location ? { Location: location } : undefined },
  );
}

export function noContent(): NextResponse {
  return new NextResponse(null, { status: 204 });
}

export interface PageMeta {
  hasMore: boolean;
  nextCursor: string | null;
}

/**
 * A cursor-paginated collection.
 *
 * Never cached: these responses carry a seller's revenue, and a shared cache
 * between two logged-in sellers would be the worst possible bug in this system.
 */
export function paginated<T>(rows: T[], meta: PageMeta): NextResponse {
  return NextResponse.json(
    { data: rows, meta },
    { status: 200, headers: { 'Cache-Control': 'private, no-store' } },
  );
}

export function toErrorResponse(error: unknown): NextResponse<ErrorBody> {
  if (error instanceof ZodError) {
    return NextResponse.json(
      {
        error: {
          code: 'validation_failed',
          message: 'Request validation failed',
          details: error.issues.map((issue) => ({
            field: issue.path.join('.'),
            message: issue.message,
          })),
        },
      },
      { status: 422 },
    );
  }

  if (error instanceof RateLimitError) {
    return NextResponse.json(
      { error: { code: error.code, message: error.publicMessage } },
      { status: 429, headers: { 'Retry-After': String(error.retryAfterSeconds) } },
    );
  }

  if (isAppError(error)) {
    logServerSide(error);
    return NextResponse.json(
      {
        error: {
          code: error.code,
          message: error.publicMessage,
          ...(error.details ? { details: error.details } : {}),
        },
      },
      { status: error.statusCode },
    );
  }

  // Unknown failure: log it, tell the client nothing beyond "it failed".
  console.error('[unhandled]', redactSecrets(String(error)));
  if (error instanceof Error && error.stack) {
    console.error(redactSecrets(error.stack));
  }

  return NextResponse.json(
    { error: { code: 'internal_error', message: 'Something went wrong. Please try again.' } },
    { status: 500 },
  );
}

/**
 * 5xx means we broke something and needs investigating; 4xx is the client being
 * told no, which is normal traffic and not worth the noise.
 */
function logServerSide(error: AppError): void {
  if (error.statusCode >= 500) {
    console.error(`[${error.code}]`, redactSecrets(error.message));
  }
}
