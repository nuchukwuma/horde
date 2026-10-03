/**
 * One layout for every email we send, rendered twice: as HTML and as plain
 * text, from the same blocks, so the two can never say different things.
 *
 * Email HTML is its own dialect. What this file does, and why:
 *
 *   - Tables and inline styles. Gmail strips <style> in some views and Outlook
 *     renders with Word's engine; nothing else lays out reliably in both.
 *   - The wordmark is TEXT, not an image. Most clients block remote images
 *     until the reader opts in, and an email whose header is a broken-image
 *     icon looks like phishing — the opposite of what a logo is for.
 *   - The button is a real link with the URL also printed underneath, for
 *     clients that mangle buttons and for readers who would rather paste.
 *   - Light only, declared as such. Clients that force dark mode invert
 *     colours they think are safe; declaring `color-scheme: light` and using
 *     solid backgrounds keeps the button readable when they do.
 *
 * Every value interpolated into HTML goes through `escapeHtml`, and every URL
 * through `safeUrl`. Store names, buyer names and product titles are typed by
 * sellers and shoppers: an email is as much an injection target as a page.
 */

export interface EmailButton {
  label: string;
  url: string;
}

export type EmailBlock =
  | { kind: 'p'; text: string }
  /** Smaller, quieter text: expiry times, "if this wasn't you". */
  | { kind: 'note'; text: string }
  /** Item lines, account details — set in a tinted box. */
  | { kind: 'box'; lines: string[] }
  | { kind: 'button'; button: EmailButton }
  /** A secondary link, written out as "label: url" in the text version. */
  | { kind: 'link'; label: string; url: string };

export interface EmailLayout {
  /** Shown by most inboxes after the subject. Hidden in the body. */
  preheader: string;
  heading: string;
  greeting?: string;
  blocks: EmailBlock[];
  /**
   * Whose email this is. Defaults to HordeMart; a store's own emails to its
   * shoppers carry the store's name with "on HordeMart" beneath it.
   */
  brand?: { name: string; byline?: string };
  /** Why the reader is getting this. Always shown. */
  reason: string;
  /** One-click unsubscribe, for anything that is not strictly transactional. */
  unsubscribeUrl?: string;
}

export interface RenderedEmail {
  html: string;
  text: string;
}

const COLORS = {
  page: '#f1f2f8',
  card: '#ffffff',
  ink: '#161a33',
  secondary: '#4a4f6a',
  muted: '#7a7f98',
  border: '#dfe2ee',
  accent: '#22307a',
  accentInk: '#ffffff',
  wash: '#f6edd6',
  brass: '#c99a2e',
} as const;

const FONT = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

export function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Only absolute http(s) links. Every URL here is built by our own code from
 * APP_HOST or a site's origin, so anything else is a bug — thrown rather than
 * rendered, because a `javascript:` href in a sent email cannot be recalled.
 */
export function safeUrl(url: string): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('Email link is not an absolute URL');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Email link must be http(s)');
  }
  return parsed.toString();
}

/** Line breaks in seller-typed text become spaces: one block, one paragraph. */
function oneLine(value: string): string {
  return String(value).replace(/[\r\n]+/g, ' ').trim();
}

function renderBlockHtml(block: EmailBlock): string {
  switch (block.kind) {
    case 'p':
      return `<p style="margin:0 0 16px;font:16px/1.55 ${FONT};color:${COLORS.ink};">${escapeHtml(oneLine(block.text))}</p>`;
    case 'note':
      return `<p style="margin:0 0 14px;font:14px/1.5 ${FONT};color:${COLORS.secondary};">${escapeHtml(oneLine(block.text))}</p>`;
    case 'box':
      return [
        `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 18px;border-collapse:separate;">`,
        `<tr><td style="background:${COLORS.page};border:1px solid ${COLORS.border};border-radius:8px;padding:14px 16px;">`,
        block.lines
          .map(
            (line) =>
              `<div style="font:15px/1.6 ${FONT};color:${COLORS.ink};">${escapeHtml(oneLine(line))}</div>`,
          )
          .join(''),
        `</td></tr></table>`,
      ].join('');
    case 'button': {
      const href = escapeHtml(safeUrl(block.button.url));
      return [
        `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 12px;">`,
        `<tr><td align="center" bgcolor="${COLORS.accent}" style="border-radius:8px;">`,
        `<a href="${href}" target="_blank" style="display:inline-block;padding:14px 26px;font:600 16px/1.2 ${FONT};color:${COLORS.accentInk};text-decoration:none;border-radius:8px;">${escapeHtml(block.button.label)}</a>`,
        `</td></tr></table>`,
        `<p style="margin:0 0 18px;font:13px/1.5 ${FONT};color:${COLORS.muted};">Button not working? Paste this into your browser:<br>`,
        `<a href="${href}" target="_blank" style="color:${COLORS.accent};word-break:break-all;">${href}</a></p>`,
      ].join('');
    }
    case 'link': {
      const href = escapeHtml(safeUrl(block.url));
      return `<p style="margin:0 0 14px;font:15px/1.5 ${FONT};"><a href="${href}" target="_blank" style="color:${COLORS.accent};font-weight:600;">${escapeHtml(block.label)}</a></p>`;
    }
  }
}

function renderBlockText(block: EmailBlock): string {
  switch (block.kind) {
    case 'p':
    case 'note':
      return oneLine(block.text);
    case 'box':
      return block.lines.map((line) => `  ${oneLine(line)}`).join('\n');
    case 'button':
      return `${block.button.label}:\n${safeUrl(block.button.url)}`;
    case 'link':
      return `${block.label}: ${safeUrl(block.url)}`;
  }
}

export function renderEmail(layout: EmailLayout): RenderedEmail {
  const brandName = oneLine(layout.brand?.name ?? 'HordeMart');
  const byline = layout.brand?.byline ? oneLine(layout.brand.byline) : null;
  const unsubscribe = layout.unsubscribeUrl ? safeUrl(layout.unsubscribeUrl) : null;

  const textParts = [
    ...(layout.greeting ? [oneLine(layout.greeting), ''] : []),
    ...layout.blocks.flatMap((block) => [renderBlockText(block), '']),
    '—',
    byline ? `${brandName} · ${byline}` : brandName,
    oneLine(layout.reason),
    ...(unsubscribe ? [`Stop these emails: ${unsubscribe}`] : []),
  ];

  const html = [
    '<!doctype html>',
    '<html lang="en"><head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<meta name="color-scheme" content="light">',
    '<meta name="supported-color-schemes" content="light">',
    `<title>${escapeHtml(oneLine(layout.heading))}</title>`,
    '</head>',
    `<body style="margin:0;padding:0;background:${COLORS.page};">`,
    // The preheader: what the inbox list shows after the subject.
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(oneLine(layout.preheader))}</div>`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.page}" style="background:${COLORS.page};">`,
    '<tr><td align="center" style="padding:24px 12px;">',
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">',
    // Wordmark
    '<tr><td style="padding:4px 4px 16px;">',
    `<div style="font:700 22px/1.2 Georgia, 'Times New Roman', serif;color:${COLORS.accent};letter-spacing:-0.01em;">${escapeHtml(brandName)}</div>`,
    byline
      ? `<div style="font:12px/1.4 ${FONT};color:${COLORS.muted};margin-top:2px;">${escapeHtml(byline)}</div>`
      : '',
    '</td></tr>',
    // Card
    `<tr><td bgcolor="${COLORS.card}" style="background:${COLORS.card};border:1px solid ${COLORS.border};border-top:4px solid ${COLORS.brass};border-radius:10px;padding:28px 24px 12px;">`,
    `<h1 style="margin:0 0 18px;font:700 22px/1.3 ${FONT};color:${COLORS.ink};">${escapeHtml(oneLine(layout.heading))}</h1>`,
    layout.greeting
      ? `<p style="margin:0 0 16px;font:16px/1.55 ${FONT};color:${COLORS.ink};">${escapeHtml(oneLine(layout.greeting))}</p>`
      : '',
    ...layout.blocks.map(renderBlockHtml),
    '</td></tr>',
    // Footer
    `<tr><td style="padding:16px 4px 8px;font:12px/1.6 ${FONT};color:${COLORS.muted};">`,
    `<div>${escapeHtml(oneLine(layout.reason))}</div>`,
    unsubscribe
      ? `<div style="margin-top:6px;"><a href="${escapeHtml(unsubscribe)}" target="_blank" style="color:${COLORS.muted};text-decoration:underline;">Stop these emails</a></div>`
      : '',
    `<div style="margin-top:6px;">HordeMart · Websites for Nigerian businesses</div>`,
    '</td></tr>',
    '</table>',
    '</td></tr></table>',
    '</body></html>',
  ].join('');

  return { html, text: textParts.join('\n') };
}
