'use client';

import { useState } from 'react';

/** "Send the link again", for a seller who lost the verification email. */
export default function ResendVerification() {
  const [state, setState] = useState('idle');
  const [message, setMessage] = useState(null);

  async function resend() {
    setState('busy');
    try {
      const response = await fetch('/api/auth/verify-email/resend', { method: 'POST' });
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
