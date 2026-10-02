/**
 * Descriptions and posts are typed as plain text — a seller on a phone should
 * not need to know HTML — and stored as the sanitised HTML the storefront
 * renders. The server sanitises whatever arrives regardless
 * (sanitizeRichText); escaping here only makes sure "<3 for 5k" shows as
 * typed.
 *
 * Always: a blank line starts a new paragraph, a single line break stays a
 * line break, and web addresses become links.
 * With `rich` (blog posts and project write-ups), also:
 *   ## Heading        → a section heading
 *   ### Smaller       → a smaller heading
 *   - item (each line) → a bulleted list
 */

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Escape, then turn https:// addresses into links. Trailing punctuation stays outside the link. */
function inline(text: string): string {
  return escapeHtml(text).replace(/\bhttps?:\/\/[^\s<]+/g, (match) => {
    const url = match.replace(/[.,;:!?)]+$/, '');
    const rest = match.slice(url.length);
    return `<a href="${url}">${url}</a>${rest}`;
  });
}

export function plainTextToHtml(text: string, { rich = false }: { rich?: boolean } = {}): string {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      if (rich) {
        const heading = block.match(/^(#{2,3})\s+(.+)$/);
        if (heading && !block.includes('\n')) {
          const level = heading[1]!.length;
          return `<h${level}>${inline(heading[2]!.trim())}</h${level}>`;
        }
        const lines = block.split('\n');
        if (lines.every((line) => /^[-*•]\s+/.test(line))) {
          return `<ul>${lines.map((line) => `<li>${inline(line.replace(/^[-*•]\s+/, ''))}</li>`).join('')}</ul>`;
        }
      }
      return `<p>${block.split('\n').map(inline).join('<br>')}</p>`;
    })
    .join('');
}

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", apos: "'", nbsp: ' ' };

/** Back to editable text — the inverse of plainTextToHtml, and tolerant of HTML it did not write. */
export function htmlToPlainText(html: string): string {
  return String(html ?? '')
    .replace(/<h2[^>]*>/gi, '## ')
    .replace(/<h3[^>]*>/gi, '### ')
    .replace(/<h[456][^>]*>/gi, '### ')
    .replace(/<a\s[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, (_, href: string, label: string) => {
      const text = label.replace(/<[^>]*>/g, '');
      return text === href || !href ? text : `${text} (${href})`;
    })
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|ul|ol|blockquote)>/gi, '\n\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#39|[a-z]+);/gi, (match, name: string) => ENTITIES[name.toLowerCase()] ?? match)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
