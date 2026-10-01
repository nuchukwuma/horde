/**
 * Turn a refused save or publish into a sentence a seller can act on.
 *
 * The server names problems by data path ("content.1.props.ctaHref",
 * "darkColors.text"), which is right for an API and meaningless to a seller.
 * This maps the path back onto what the seller sees: the block's name and
 * position on the page, and the field's label in the editor.
 *
 * Two error shapes arrive here (lib/http/respond.ts): zod failures carry
 * `details: [{ field: 'a.b.c', message }]`; page-layout failures carry
 * `details: { issues: [{ path: [...], message }] }`.
 */

const SIGNED_OUT =
  'You have been signed out. Sign in again in another tab, then press Save here — your changes are still on this page.';

/** "Button link (a page in your store, like /shop)" → "Button link". */
function shortLabel(label, fallback) {
  return String(label || fallback).replace(/\s*\(.*\)\s*$/, '');
}

function firstIssue(error) {
  const details = error?.details;
  if (Array.isArray(details) && details[0]) {
    return { path: String(details[0].field ?? '').split('.').filter(Boolean), message: details[0].message };
  }
  const issue = details?.issues?.[0];
  if (issue) return { path: (issue.path ?? []).map(String), message: issue.message };
  return null;
}

function describePath(path, message, page, config) {
  if (path[0] === 'content' && path[1] !== undefined) {
    const index = Number(path[1]);
    const block = page?.content?.[index];
    const component = config?.components?.[block?.type];
    const where = `${component?.label ?? 'A block'} (block ${index + 1})`;
    const fieldKey = path[3];
    const field = component?.fields?.[fieldKey];
    if (!field) return `${where}: ${message}`;
    // Inside a list (categories, reviews, questions): name the item too.
    if (field.type === 'array' && path[4] !== undefined) {
      const sub = field.arrayFields?.[path[5]];
      const item = `${shortLabel(field.label, fieldKey)} ${Number(path[4]) + 1}`;
      return `${where} → ${item}${sub ? ` → ${shortLabel(sub.label, path[5])}` : ''}: ${message}`;
    }
    return `${where} → ${shortLabel(field.label, fieldKey)}: ${message}`;
  }
  if (path[0] === 'colors' || path[0] === 'darkColors') return `Brand colours: ${message}`;
  if (path[0] === 'logo' || path[0] === 'logoDark') return `Logo: ${message}`;
  return message;
}

/**
 * @returns {{ text: string, reload?: boolean }}
 */
export function describeDesignError(status, body, page, config) {
  if (status === 401) return { text: SIGNED_OUT };
  const error = body?.error;
  if (status === 409) {
    return { text: error?.message ?? 'This design was changed somewhere else. Reload to see the latest.', reload: true };
  }
  const issue = firstIssue(error);
  if (issue?.message) return { text: describePath(issue.path, issue.message, page, config) };
  return { text: error?.message ?? 'Could not save. Check your connection and try again.' };
}
