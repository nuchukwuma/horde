'use client';

import { useState } from 'react';

/**
 * The seller's own public address, with a copy button.
 *
 * This earns its place at the top of the dashboard because of how this market
 * actually works: sellers share their link in WhatsApp statuses, Instagram
 * bios and DMs, over and over, from a phone. Making them retype a subdomain
 * they half-remember is the difference between a store that gets shared and
 * one that does not.
 *
 * `navigator.clipboard` needs a secure context, so over plain HTTP on a LAN
 * address it simply is not there. The fallback is not an error message — it is
 * selecting the text so a long-press or Ctrl+C works, which is what someone
 * would do anyway.
 */

export default function StoreLink({ url }) {
  const [state, setState] = useState('idle');

  async function copy() {
    try {
      if (!navigator.clipboard) throw new Error('no clipboard');
      await navigator.clipboard.writeText(url);
      setState('copied');
      setTimeout(() => setState('idle'), 2000);
    } catch {
      setState('select');
      const node = document.getElementById('store-link-text');
      if (node) {
        const range = document.createRange();
        range.selectNodeContents(node);
        const selection = window.getSelection();
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
    }
  }

  return (
    <div
      className="card"
      style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}
    >
      <div style={{ flex: '1 1 240px', minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Your store address</div>
        {/* Breaks anywhere rather than forcing a horizontal scroll on a phone. */}
        <a
          id="store-link-text"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: 15, overflowWrap: 'anywhere' }}
        >
          {url}
        </a>
      </div>

      <button className="btn" type="button" onClick={copy}>
        {state === 'copied' ? 'Copied' : 'Copy link'}
      </button>

      {/* Announced rather than only shown, and it says what to do next when
          the clipboard was unavailable. */}
      <p role="status" style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', flexBasis: '100%' }}>
        {state === 'copied' ? 'Link copied to your clipboard.' : null}
        {state === 'select' ? 'Selected — press Ctrl+C, or long-press to copy.' : null}
      </p>
    </div>
  );
}
