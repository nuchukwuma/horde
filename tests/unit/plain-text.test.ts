/**
 * Plain text ⇄ stored HTML, for the product, post and project editors, and
 * kobo → the naira string an edit form is pre-filled with.
 */

import { describe, expect, it } from 'vitest';
import { htmlToPlainText, plainTextToHtml } from '../../src/lib/ui/plainText';
import { koboToNairaInput, nairaToKobo } from '../../src/lib/money/kobo';

describe('plainTextToHtml', () => {
  it('makes paragraphs and line breaks', () => {
    expect(plainTextToHtml('One\ntwo\n\nThree')).toBe('<p>One<br>two</p><p>Three</p>');
  });

  it('escapes what was typed instead of rendering it', () => {
    expect(plainTextToHtml('<script>alert(1)</script> & <3')).toBe(
      '<p>&lt;script&gt;alert(1)&lt;/script&gt; &amp; &lt;3</p>',
    );
  });

  it('links web addresses, leaving trailing punctuation outside', () => {
    expect(plainTextToHtml('See https://example.com/a?b=1.')).toBe(
      '<p>See <a href="https://example.com/a?b=1">https://example.com/a?b=1</a>.</p>',
    );
    expect(plainTextToHtml('javascript:alert(1)')).toBe('<p>javascript:alert(1)</p>');
  });

  it('turns ## and - lines into headings and lists only when rich', () => {
    const text = '## Care\n\n- Hand wash\n- Dry in shade';
    expect(plainTextToHtml(text, { rich: true })).toBe('<h2>Care</h2><ul><li>Hand wash</li><li>Dry in shade</li></ul>');
    expect(plainTextToHtml(text)).toBe('<p>## Care</p><p>- Hand wash<br>- Dry in shade</p>');
  });

  it('round-trips through htmlToPlainText', () => {
    const text = '## Care\n\nHand wash only.\nCold water.\n\n- One\n- Two\n\nMore at https://example.com';
    expect(htmlToPlainText(plainTextToHtml(text, { rich: true }))).toBe(text);
  });
});

describe('htmlToPlainText', () => {
  it('reads HTML it did not write', () => {
    expect(htmlToPlainText('<p>A <strong>bold</strong> &amp; <a href="https://x.ng">shop</a></p><p>B</p>')).toBe(
      'A bold & shop (https://x.ng)\n\nB',
    );
  });

  it('does not double-decode', () => {
    expect(htmlToPlainText('<p>&amp;lt;b&amp;gt;</p>')).toBe('&lt;b&gt;');
  });
});

describe('koboToNairaInput', () => {
  it.each([
    [250_000, '2500'],
    [250_050, '2500.50'],
    [250_005, '2500.05'],
    [5_000, '50'],
    [0, '0'],
  ])('%i kobo → "%s"', (kobo, naira) => {
    expect(koboToNairaInput(kobo)).toBe(naira);
    expect(nairaToKobo(naira)).toBe(kobo);
  });

  it('refuses a float or a negative', () => {
    expect(() => koboToNairaInput(10.5)).toThrow();
    expect(() => koboToNairaInput(-1)).toThrow();
  });
});
