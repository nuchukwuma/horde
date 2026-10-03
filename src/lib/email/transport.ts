/**
 * Outbound email.
 *
 * Two transports. Which one is used is decided by configuration, not by a
 * flag someone can get wrong:
 *
 *   resend  — when RESEND_API_KEY is set
 *   log     — otherwise: writes the message to the console and returns
 *
 * The log transport exists so that a developer with no Resend account still
 * gets a working signup flow with a verification link they can click, printed
 * in the terminal. It is not a silent no-op: a caller can see from the result
 * which transport ran, and `sendEmail` says so in the log line.
 *
 * In production the absence of a key is a misconfiguration rather than a mode.
 * `assertEmailConfigured()` is called at the points where silently not sending
 * would strand a user — currently issuing a verification link.
 *
 * The API key is read from the environment at call time and never logged, not
 * even redacted: there is no code path here that puts it in a string.
 */

import { AppError } from '../errors';

export interface EmailMessage {
  to: string;
  subject: string;
  /** Plain text. Every message here is transactional and short. */
  text: string;
  html?: string;
  /**
   * Display name for the From header, e.g. a store's own name on its emails
   * to shoppers. The address is always EMAIL_FROM's; only the name changes,
   * and it is cleaned by `fromWithName` because it is seller-typed.
   */
  fromName?: string;
  /** Extra headers. Today only List-Unsubscribe and List-Unsubscribe-Post. */
  headers?: Record<string, string>;
}

export type TransportName = 'resend' | 'log';

export interface SendResult {
  transport: TransportName;
  /** Provider id when there is one. The log transport has none. */
  id: string | null;
}

export class EmailDeliveryError extends AppError {
  constructor(message: string) {
    super(502, 'email_delivery_failed', message, {
      publicMessage: 'We could not send that email. Please try again shortly.',
    });
  }
}

export function emailTransport(
  env: Record<string, string | undefined> = process.env,
): TransportName {
  return env.RESEND_API_KEY ? 'resend' : 'log';
}

export function emailFrom(env: Record<string, string | undefined> = process.env): string {
  // A verified sender domain is a Resend requirement, so this has no sensible
  // default in production — but a placeholder keeps local development working.
  return env.EMAIL_FROM ?? 'HordeMart <onboarding@resend.dev>';
}

/**
 * "Ade Fabrics via HordeMart" <onboarding@resend.dev>
 *
 * The name is seller-typed and goes into a mail header, so anything that could
 * end the header or open a new one (CR, LF), break out of the quoted name
 * (quotes, backslash) or start an address (<, >) is removed rather than
 * escaped. Long names are cut: some clients show nothing at all when it
 * overflows.
 */
export function fromWithName(
  name: string,
  env: Record<string, string | undefined> = process.env,
): string {
  const from = emailFrom(env);
  const address = /<([^<>]+)>\s*$/.exec(from)?.[1] ?? from.trim();
  const clean = name
    .replace(/[\u0000-\u001f\u007f"\\<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60)
    .trim();
  if (!clean) return from;
  return `"${clean} via HordeMart" <${address}>`;
}

const ALLOWED_HEADERS = new Set(['List-Unsubscribe', 'List-Unsubscribe-Post']);

function cleanHeaders(headers: Record<string, string> | undefined): Record<string, string> | null {
  if (!headers) return null;
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (!ALLOWED_HEADERS.has(key)) throw new Error(`Email header ${key} is not allowed`);
    // A newline in a header value is header injection.
    if (/[\r\n]/.test(value)) throw new Error('Email header value contains a line break');
    out[key] = value;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Refuse to continue where not sending would leave someone stuck.
 *
 * Called before issuing a verification link in production. Without it, a
 * deploy missing RESEND_API_KEY would print verification links into the server
 * log and tell every new seller to check an inbox that will never receive
 * anything.
 */
export function assertEmailConfigured(
  env: Record<string, string | undefined> = process.env,
): void {
  if (env.NODE_ENV === 'production' && emailTransport(env) === 'log') {
    throw new EmailDeliveryError(
      'RESEND_API_KEY is not configured; refusing to pretend an email was sent',
    );
  }
}

export async function sendEmail(
  message: EmailMessage,
  env: Record<string, string | undefined> = process.env,
): Promise<SendResult> {
  const transport = emailTransport(env);
  const headers = cleanHeaders(message.headers);
  const from = message.fromName ? fromWithName(message.fromName, env) : emailFrom(env);
  // Subjects carry store names, which sellers type. One line, always.
  const subject = message.subject.replace(/[\r\n]+/g, ' ').trim();

  if (transport === 'log') {
    // Deliberately the whole body: the point is that a developer can click the
    // link. This path never runs in production — assertEmailConfigured throws
    // first — so it cannot leak a real customer's mail into a shared log.
    console.info(
      `[email:log] from=${from} to=${message.to} subject=${subject}\n${message.text}`,
    );
    return { transport, id: null };
  }

  let response: Response;
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [message.to],
        subject,
        text: message.text,
        ...(message.html ? { html: message.html } : {}),
        ...(headers ? { headers } : {}),
      }),
    });
  } catch {
    // The underlying error can carry request detail including headers. Nothing
    // from it is propagated.
    throw new EmailDeliveryError('Could not reach the email provider');
  }

  if (!response.ok) {
    // Status only. A provider error body has been known to echo the request,
    // and the request carries the API key.
    throw new EmailDeliveryError(`Email provider rejected the message (${response.status})`);
  }

  const body = (await response.json().catch(() => ({}))) as { id?: string };
  return { transport, id: body.id ?? null };
}
