'use client';

import { useState } from 'react';

/**
 * "Send the link again", for someone who lost the confirmation email. Sellers
 * by default; a store passes its own shopper endpoint.
 */
export default function ResendVerification({ endpoint = '/api/auth/verify-email/resend' }) {
  const [state, setState] = useState('idle');
  const [message, setMessage] = useState(null);

  async function resend() {
    setState('busy');
    try {
      const response = await fetch(endpoint, { method: 'POST' });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error?.message ?? 'Could not send the email.');
      setState('sent');
      setMessage('Sent. Check your inbox (and spam folder).');
    } catch (problem) {
      setState('idle');
      setMessage(problem.message);
    }
  }

  return (
    <>
      <button type="button" className="btn btn--sm" onClick={resend} disabled={state !== 'idle'}>
        {state === 'busy' ? 'Sending…' : state === 'sent' ? 'Sent' : 'Send the link again'}
      </button>
      {message ? (
        <span role="status" style={{ display: 'block', marginTop: 6, fontSize: 13.5 }}>
          {message}
        </span>
      ) : null}
    </>
  );
}
