'use client';

import { useState } from 'react';
import ChatThread from './ChatThread';

/**
 * Conversation list plus the selected thread.
 *
 * A list-then-thread layout rather than two panes: sellers here are on phones
 * most of the time, and a side-by-side inbox on a 390px screen gives two
 * columns too narrow to read.
 */

export default function SellerInbox({ siteId, conversations }) {
  const [openId, setOpenId] = useState(null);

  if (openId) {
    const conversation = conversations.find((row) => row.id === openId);

    return (
      <div className="stack" style={{ '--stack-gap': '16px' }}>
        <button className="btn" type="button" onClick={() => setOpenId(null)}>
          ← All messages
        </button>

        {conversation?.flaggedMessageCount > 0 ? (
          <div className="card" role="note" style={{ borderColor: 'var(--warning)', fontSize: 14 }}>
            <strong>
              {conversation.flaggedMessageCount} message
              {conversation.flaggedMessageCount === 1 ? '' : 's'} in this thread mentioned
              paying outside the store
            </strong>
            <p style={{ margin: '6px 0 0', color: 'var(--text-secondary)' }}>
              Taking payment by bank transfer leaves your customer with no receipt and no
              refund, and it is the most common way buyers get defrauded on marketplaces.
              Point customers at the checkout button instead — it also means the sale counts
              towards your payouts here.
            </p>
          </div>
        ) : null}

        <ChatThread
          endpoint={`/api/sites/${siteId}/chat/${openId}`}
          side="seller"
          emptyMessage="No messages in this conversation."
          placeholder="Reply to your customer…"
        />
      </div>
    );
  }

  return (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {conversations.map((conversation) => (
        <li key={conversation.id} style={{ marginBottom: 10 }}>
          <button
            type="button"
            onClick={() => setOpenId(conversation.id)}
            className="card"
            style={{
              width: '100%',
              textAlign: 'left',
              cursor: 'pointer',
              font: 'inherit',
              color: 'inherit',
              display: 'block',
            }}
          >
            <div className="row row--between" style={{ gap: 10, flexWrap: 'wrap' }}>
              <strong style={{ fontSize: 15 }}>
                Customer
                {conversation.unreadForSeller > 0 ? (
                  // A count and a word, never colour alone.
                  <span className="badge badge--good" style={{ marginLeft: 8 }}>
                    {conversation.unreadForSeller} new
                  </span>
                ) : null}
                {conversation.flaggedMessageCount > 0 ? (
                  <span className="badge badge--warning" style={{ marginLeft: 8 }}>
                    ▲ flagged
                  </span>
                ) : null}
              </strong>
              <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                {conversation.lastMessageAt}
              </span>
            </div>

            <p
              style={{
                color: 'var(--text-secondary)',
                margin: '6px 0 0',
                fontSize: 14,
                overflowWrap: 'anywhere',
              }}
            >
              {conversation.lastMessagePreview || 'No messages yet.'}
            </p>
          </button>
        </li>
      ))}
    </ul>
  );
}
