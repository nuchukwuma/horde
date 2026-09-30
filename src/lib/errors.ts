/**
 * Error taxonomy. Every error carries a `publicMessage` that is safe to return
 * to a client; `message` may contain detail that must stay in server logs.
 */

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly publicMessage: string;
  readonly details?: unknown;

  constructor(
    statusCode: number,
    code: string,
    message: string,
    options: { publicMessage?: string; details?: unknown; cause?: unknown } = {},
  ) {
    super(message, { cause: options.cause });
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = code;
    this.publicMessage = options.publicMessage ?? message;
    this.details = options.details;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(422, 'validation_failed', message, { details });
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(401, 'unauthenticated', message, { publicMessage: 'Authentication required' });
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Insufficient permissions') {
    super(403, 'forbidden', message, { publicMessage: 'You do not have access to this resource' });
  }
}

/** Raised when a sensitive action needs a fresh password confirmation. */
export class StepUpRequiredError extends AppError {
  constructor(message = 'Re-authentication required for this action') {
    super(403, 'step_up_required', message);
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(404, 'not_found', `${resource} not found`);
  }
}

export class ConflictError extends AppError {
  /**
   * `details` lets a caller say WHICH field collided, so a form can put the
   * message beside the offending input instead of in a banner at the top and
   * leaving the reader to work out which box to change. Optional, so every
   * existing call site is unaffected.
   */
  constructor(message: string, details?: unknown) {
    super(409, 'conflict', message, { details });
  }
}

export class RateLimitError extends AppError {
  readonly retryAfterSeconds: number;
  constructor(retryAfterSeconds: number) {
    super(429, 'rate_limited', 'Too many requests', {
      publicMessage: 'Too many requests. Please slow down and try again.',
    });
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/**
 * A tenant-owned query was attempted with no tenant in scope, or with a tenant
 * that does not match the ambient one. This is a programming error, not user
 * input — it means a query escaped the tenant plugin.
 */
export class TenantScopeError extends AppError {
  constructor(message: string) {
    super(500, 'tenant_scope_violation', message, {
      publicMessage: 'Request could not be completed',
    });
  }
}

/** An append-only collection rejected a mutation. */
export class ImmutableRecordError extends AppError {
  constructor(modelName: string, operation: string) {
    super(
      500,
      'immutable_record',
      `${modelName} is append-only; ${operation} is not permitted. Write a reversing entry instead.`,
      { publicMessage: 'Request could not be completed' },
    );
  }
}

/** Payout details are unverified, so the site may not take payments yet. */
export class PayoutNotVerifiedError extends AppError {
  constructor(message = 'Payout details must be verified before accepting payments') {
    super(409, 'payout_not_verified', message);
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}
