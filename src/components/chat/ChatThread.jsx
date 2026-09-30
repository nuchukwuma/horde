'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A chat thread, polled.
 *
 * Polling rather than a WebSocket because this deploys to serverless, where
 * there is no process to hold a connection open. The honest options were
 * polling or a third-party realtime service, and adding a paid dependency to
 * make a shop's message list update two seconds sooner is not a trade worth
 * making yet. Six seconds is slower than a chat app and entirely fine for
 * "is this in stock?".
 *
 * Polling pauses when the tab is hidden. A shop page left open in a background
 * tab for a day would otherwise make 14,400 requests to learn nothing.
 */

const POLL_MS = 6000;

export default function ChatThread({
  endpoint,
  side,
  emptyMessage = 'No messages yet.',
  placeholder = 'Write a message…',
}) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [warning, setWarning] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const bottom = useRef(null);

  const load = useCallback(async () => {
    try {
      const response = await fetch(endpoint, { cache: 'no-store' });
      if (!response.ok) return;
      const body = await response.json();
      // The two endpoints differ: the shopper's returns an object with a
      // messages array, the seller's returns the array directly.
      setMessages(Array.isArray(body.data) ? body.data : (body.data?.messages ?? []));
      setLoaded(true);
    } catch {
      // A failed poll is not worth surfacing — the next one is six seconds away.
    }
  }, [endpoint]);

  useEffect(() => {
    load();

    let timer = null;

    function schedule() {
      clearTimeout(timer);
      if (document.visibilityState === 'visible') {
        timer = setTimeout(async () => {
          await load();
          schedule();
        }, POLL_MS);
      }
    }

    function onVisibility() {
      if (document.visibilityState === 'visible') {
        load();
        schedule();
      } else {
        clearTimeout(timer);
      }
    }

    schedule();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [load]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  async function send(event) {
    event.preventDefault();
    const body = draft.trim();
    if (!body) return;

    setBusy(true);
    setError(null);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body }),
      });

      const payload = await response.json();

      if (!response.ok) {
        setError(payload?.error?.message ?? 'Could not send that message');
        return;
      }

      setDraft('');
      // Set before reloading so the warning is visible immediately.
      if (payload.data?.warning) setWarning(payload.data.warning);
      await load();
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stack" style={{ '--stack-gap': '14px' }}>
      {/* The off-platform payment warning. An alert, not a toast: it must not
          disappear before it has been read. */}
      {warning ? (
        <div
          className="card"
          role="alert"
          style={{ borderColor: 'var(--warning)', fontSize: 14 }}
        >
          <strong>Keep your payment safe</strong>
          <p style={{ margin: '6px 0 0', color: 'var(--text-secondary)' }}>{warning}</p>
        </div>
      ) : null}

      <div
        style={{
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          background: 'var(--surface-1)',
          padding: 12,
          maxHeight: 420,
          overflowY: 'auto',
        }}
        // Announces new messages without stealing focus from the input.
        aria-live="polite"
      >
        {!loaded ? (
          <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Loading…</p>
        ) : messages.length === 0 ? (
          <p style={{ color: 'var(--text-secondary)', margin: 0 }}>{emptyMessage}</p>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {messages.map((message) => {
              const mine = message.from === side;
              return (
                <li
                  key={message.id}
                  style={{
                    display: 'flex',
                    justifyContent: mine ? 'flex-end' : 'flex-start',
                    marginBottom: 10,
                  }}
                >
                  <div style={{ maxWidth: '78%' }}>
                    <div
                      style={{
                        background: mine ? 'var(--accent-wash)' : 'var(--surface-2)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '8px 10px',
                        fontSize: 14.5,
                        // Preserves the sender's line breaks without allowing
                        // any markup: the body is plain text by the time it
                        // reaches here.
                        whiteSpace: 'pre-wrap',
                        overflowWrap: 'anywhere',
                      }}
                    >
                      {message.body}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: 'var(--text-muted)',
                        marginTop: 3,
                        textAlign: mine ? 'right' : 'left',
                      }}
                    >
                      {mine ? 'You' : message.from === 'seller' ? 'Store' : 'Customer'}
                      {message.flagged ? ' · flagged' : ''}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <div ref={bottom} />
      </div>

      <form onSubmit={send} className="stack" style={{ '--stack-gap': '8px' }}>
        {error ? (
          <div className="card" role="alert" style={{ borderColor: 'var(--critical)' }}>
            {error}
          </div>
        ) : null}

        <label htmlFor="chat-body" className="visually-hidden">
          Message
        </label>
        <textarea
          id="chat-body"
          rows={3}
          maxLength={4000}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={placeholder}
          style={{
            width: '100%',
            font: 'inherit',
            fontSize: 15,
            padding: '10px 12px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border-strong)',
            background: 'var(--surface-1)',
            color: 'var(--text-primary)',
            resize: 'vertical',
          }}
        />

        <div>
          <button className="btn btn--primary" type="submit" disabled={busy || !draft.trim()}>
            {busy ? 'Sending…' : 'Send'}
          </button>
        </div>
      </form>
    </div>
  );
}
