'use client';

import { useState } from 'react';

/**
 * Where the "Stop these emails" footer link lands.
 *
 * A button, not an automatic unsubscribe on load: link scanners open every
 * link in an email, and one that unsubscribed on GET would switch people off
 * without their asking. Mail clients that support one-click unsubscribe skip
 * this page and POST to the API themselves.
 */

export default function UnsubscribePage() {
  const [state, setState] = useState({ status: 'idle', message: null });

  async function stop() {
    setState({ status: 'busy', message: null });
    try {
      const response = await fetch(`/api/email/unsubscribe${window.location.search}`, { method: 'POST' });
      if (response.ok) {
        setState({ status: 'done', message: null });
      } else {
        setState({
          status: 'error',
          message: 'This link isn’t valid. Sign in and use the switch on your dashboard instead.',
        });
      }
    } catch {
      setState({ status: 'idle', message: 'Could not reach the server. Try again.' });
    }
  }

  return (
    <div className="shell">
      <header className="masthead">
        <div className="container masthead__inner">
          <a className="brand" href="/">
            HordeMart
          </a>
        </div>
      </header>

      <main id="main" className="container" style={{ maxWidth: 460, paddingBlock: '64px' }}>
        <div role="status">
          {state.status === 'done' ? (
            <>
              <h1 style={{ fontSize: 24, marginBottom: 8 }}>You won’t get setup tips any more</h1>
              <p style={{ color: 'var(--text-secondary)', marginTop: 0 }}>
                We’ll still email you about things you need to know — orders, password resets and changes to your
                bank details.
              </p>
              <a className="btn" href="/login">
                Go to your dashboard
              </a>
            </>
          ) : state.status === 'error' ? (
            <>
              <h1 style={{ fontSize: 24, marginBottom: 8 }}>That link didn’t work</h1>
              <p style={{ color: 'var(--text-secondary)', marginTop: 0 }}>{state.message}</p>
              <a className="btn btn--primary" href="/login">
                Sign in
              </a>
            </>
          ) : (
            <>
              <h1 style={{ fontSize: 24, marginBottom: 8 }}>Stop setup tips?</h1>
              <p style={{ color: 'var(--text-secondary)', marginTop: 0 }}>
                These are the occasional emails reminding you to add products or connect your bank account. Emails
                about orders, password resets and your bank details will still come.
              </p>
              <button type="button" className="btn btn--primary" onClick={stop} disabled={state.status === 'busy'}>
                {state.status === 'busy' ? 'Stopping…' : 'Stop these emails'}
              </button>
              {state.message ? <p style={{ marginTop: 12 }}>{state.message}</p> : null}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
