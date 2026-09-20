/**
 * Paystack HTTP transport.
 *
 * This is the project's first external connector, so it sets the pattern the
 * others should follow: transport here, contracts in `types.ts`, operations in
 * a sibling module. Callers never see fetch, headers, or status codes.
 */

import { AppError } from '../errors';
import type { PaystackEnvelope } from './types';

const DEFAULT_BASE_URL = 'https://api.paystack.co';
const DEFAULT_TIMEOUT_MS = 15_000;

/** Paystack said no, and told us why. Carries its own HTTP status through. */
export class PaystackError extends AppError {
  readonly paystackMessage: string;

  constructor(status: number, paystackMessage: string, publicMessage?: string) {
    super(status, 'paystack_error', `Paystack responded ${status}: ${paystackMessage}`, {
      publicMessage: publicMessage ?? 'Payment provider rejected the request',
    });
    this.paystackMessage = paystackMessage;
  }
}

/** We could not get an answer: timeout, DNS, connection reset, 5xx. */
export class PaystackUnavailableError extends AppError {
  constructor(message: string, cause?: unknown) {
    super(502, 'paystack_unavailable', `Paystack unreachable: ${message}`, {
      publicMessage: 'Payment provider is temporarily unavailable. Please try again.',
      cause,
    });
  }
}

export interface PaystackConfig {
  secretKey: string;
  baseUrl: string;
  timeoutMs: number;
}

/**
 * Reads config from the environment.
 *
 * Refuses a live key unless HORDEMART_ALLOW_LIVE_KEYS is explicitly set. The
 * repository's standing rule is test keys only until the owner says otherwise
 * in writing, and a rule that only exists in a document gets broken by accident
 * during a deploy.
 */
export function readPaystackConfig(env: NodeJS.ProcessEnv = process.env): PaystackConfig {
  const secretKey = env.PAYSTACK_SECRET_KEY;

  if (!secretKey) {
    throw new Error('PAYSTACK_SECRET_KEY is not configured');
  }

  if (!secretKey.startsWith('sk_test_') && env.HORDEMART_ALLOW_LIVE_KEYS !== 'true') {
    throw new Error(
      'Refusing to use a non-test Paystack key. Set HORDEMART_ALLOW_LIVE_KEYS=true to go live.',
    );
  }

  return {
    secretKey,
    baseUrl: env.PAYSTACK_BASE_URL ?? DEFAULT_BASE_URL,
    timeoutMs: Number(env.PAYSTACK_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS),
  };
}

/**
 * Strips anything that looks like a Paystack key from text bound for a log or
 * an error message. Keys reach this path by arriving in an upstream error body
 * or a stack frame, which is exactly when nobody is thinking about redaction.
 */
export function redactSecrets(text: string): string {
  return text.replace(/\b[sp]k_(test|live)_[A-Za-z0-9]+/g, '[redacted]');
}

export interface RequestOptions {
  method: 'GET' | 'POST' | 'PUT';
  path: string;
  body?: unknown;
  /**
   * Retries are OFF by default.
   *
   * Retrying a POST to Paystack can create a second subaccount or a second
   * transaction. Only enable it for calls that are genuinely idempotent, which
   * in practice means reads.
   */
  retry?: boolean;
  config?: PaystackConfig;
}

const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 400;

function isRetryable(error: unknown): boolean {
  if (error instanceof PaystackUnavailableError) return true;
  if (error instanceof PaystackError) {
    // 429 and 5xx may succeed on a retry; 4xx will not.
    return error.statusCode === 429 || error.statusCode >= 500;
  }
  return false;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function paystackRequest<T>(options: RequestOptions): Promise<T> {
  const config = options.config ?? readPaystackConfig();
  const attempts = options.retry ? MAX_ATTEMPTS : 1;

  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await executeRequest<T>(options, config);
    } catch (error) {
      lastError = error;
      if (attempt === attempts || !isRetryable(error)) throw error;

      const jitter = Math.random() * BASE_DELAY_MS;
      await sleep(Math.min(BASE_DELAY_MS * 2 ** (attempt - 1) + jitter, 5_000));
    }
  }

  throw lastError;
}

async function executeRequest<T>(options: RequestOptions, config: PaystackConfig): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}${options.path}`, {
      method: options.method,
      headers: {
        Authorization: `Bearer ${config.secretKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new PaystackUnavailableError(redactSecrets(reason), error);
  } finally {
    clearTimeout(timer);
  }

  const raw = await response.text();
  let payload: PaystackEnvelope<T> | undefined;

  try {
    payload = raw ? (JSON.parse(raw) as PaystackEnvelope<T>) : undefined;
  } catch {
    // A non-JSON body from a 2xx means the contract moved under us; from a 5xx
    // it is usually an edge/proxy error page.
    if (response.ok) {
      throw new PaystackUnavailableError(
        `expected JSON, got ${response.status} ${redactSecrets(raw.slice(0, 200))}`,
      );
    }
    throw new PaystackUnavailableError(`${response.status} with a non-JSON body`);
  }

  if (!response.ok || payload?.status === false) {
    const message = redactSecrets(payload?.message ?? `HTTP ${response.status}`);

    if (response.status >= 500) {
      throw new PaystackUnavailableError(message);
    }
    throw new PaystackError(response.status, message);
  }

  if (payload === undefined) {
    throw new PaystackUnavailableError('empty response body');
  }

  return payload.data;
}
