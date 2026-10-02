'use client';

import { useState } from 'react';

/**
 * Connect MrMouse, open it on the web, download the app, and switch stock
 * sync. MrMouse keeps its own account, data and subscription; this page only
 * links the two.
 */

async function send(url, method, body) {
  const response = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json().catch(() => null);
  if (!response.ok) throw new Error(result?.error?.message ?? 'That did not work. Try again.');
  return result.data;
}

export default function MrMouseCard({ siteId, isOwner, initial, launchAvailable, syncAvailable, androidUrl, iosUrl, emailVerified }) {
  const [state, setState] = useState(initial);
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const base = `/api/sites/${siteId}/integrations/mrmouse`;

  async function run(kind, task) {
    setBusy(kind);
    setError(null);
    try {
      await task();
    } catch (problem) {
      setError(problem.message);
    } finally {
      setBusy(null);
    }
  }

  const open = () =>
    run('open', async () => {
      const { url } = await send(`${base}/launch`, 'POST');
      window.location.assign(url);
    });

  const connect = () => run('connect', async () => setState(await send(base, 'PATCH', { connect: true, acceptTerms: agreed })));
  const disconnect = () => {
    if (!window.confirm('Disconnect MrMouse? Stock sync stops. Your MrMouse account and its data are not deleted.')) return;
    run('disconnect', async () => setState(await send(base, 'PATCH', { connect: false })));
  };
  const toggleSync = (on) => run('sync', async () => setState(await send(base, 'PATCH', { stockSync: on })));

  const downloads =
    androidUrl || iosUrl ? (
      <div className="mrmouse__downloads">
        {androidUrl ? (
          <a className="btn" href={androidUrl} target="_blank" rel="noopener noreferrer">
            Get it on Android
          </a>
        ) : null}
        {iosUrl ? (
          <a className="btn" href={iosUrl} target="_blank" rel="noopener noreferrer">
            Get it on iPhone
          </a>
        ) : null}
      </div>
    ) : null;

  return (
    <div className="mrmouse">
      {error ? (
        <div className="alert alert--error" role="alert">
          <span className="alert__icon" aria-hidden="true">!</span>
          <span>{error}</span>
        </div>
      ) : null}

      {!state.connected ? (
        <section className="card">
          <h2 className="product-form__title">
            {state.termsOutdated ? 'The MrMouse connection terms have changed' : 'Connect MrMouse to this store'}
          </h2>
          {state.termsOutdated ? (
            <p className="secondary" style={{ marginTop: 0 }}>
              Sign-in and stock sync are paused until you accept the new version.
            </p>
          ) : null}
          {isOwner ? (
            <>
              <p className="secondary" style={{ marginTop: 0 }}>When you connect, HordeMart shares with MrMouse:</p>
              <ul className="mrmouse__list">
                <li>your name and email, so MrMouse can sign you in to your MrMouse account;</li>
                <li>your store’s name and address;</li>
                <li>if you switch on stock sync: your products’ item codes (SKUs) and how many sold.</li>
              </ul>
              <p className="hint">
                Never your customers’ details, your bank details or your password. You can disconnect at any time.
              </p>
              <label className="checkbox terms-check" style={{ marginTop: 12 }}>
                <input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} />
                <span>
                  I have read and accept the{' '}
                  <a href="/terms/mrmouse" target="_blank" rel="noopener">
                    MrMouse connection terms
                  </a>
                  , and agree to HordeMart sharing these details with MrMouse.
                </span>
              </label>
              <button type="button" className="btn btn--primary" style={{ marginTop: 14 }} onClick={connect} disabled={!agreed || busy !== null}>
                {busy === 'connect' ? 'Connecting…' : state.termsOutdated ? 'Accept and reconnect' : 'Connect MrMouse'}
              </button>
            </>
          ) : (
            <p style={{ margin: 0 }}>Ask the store owner to connect MrMouse from this page.</p>
          )}
        </section>
      ) : (
        <>
          <section className="card mrmouse__open">
            <div>
              <h2 className="product-form__title" style={{ marginBottom: 4 }}>
                MrMouse is connected <span className="badge badge--good">● Connected</span>
              </h2>
              <p className="secondary" style={{ margin: 0 }}>
                Open it in your browser — no download needed. You’ll be signed in to your own MrMouse account.
              </p>
            </div>
            {launchAvailable ? (
              emailVerified ? (
                <button type="button" className="btn btn--primary" onClick={open} disabled={busy !== null}>
                  {busy === 'open' ? 'Opening…' : 'Open MrMouse ↗'}
                </button>
              ) : (
                <p className="hint hint--error" style={{ margin: 0 }}>
                  Confirm your email address first (see Payouts) — MrMouse uses it to find your account.
                </p>
              )
            ) : (
              <span className="badge">MrMouse on the web is coming soon</span>
            )}
          </section>

          <section className="card">
            <h2 className="product-form__title">Stock sync</h2>
            <p className="secondary" style={{ marginTop: 0 }}>
              When on, MrMouse keeps your stock counts here up to date, matched by item code (SKU), and HordeMart tells
              MrMouse whenever something sells. Products without an item code are not synced. Prices always stay as you
              set them here.
            </p>
            {syncAvailable ? (
              isOwner ? (
                <label className="checkbox">
                  <input
                    type="checkbox"
                    checked={state.stockSync}
                    disabled={busy !== null}
                    onChange={(event) => toggleSync(event.target.checked)}
                  />
                  <span>{state.stockSync ? 'Stock sync is on' : 'Turn on stock sync'}</span>
                </label>
              ) : (
                <p style={{ margin: 0 }}>Stock sync is {state.stockSync ? 'on' : 'off'}. Only the store owner can change it.</p>
              )
            ) : (
              <span className="badge">Coming soon</span>
            )}
          </section>

          {isOwner ? (
            <button type="button" className="btn btn--quiet mrmouse__disconnect" onClick={disconnect} disabled={busy !== null}>
              {busy === 'disconnect' ? 'Disconnecting…' : 'Disconnect MrMouse'}
            </button>
          ) : null}
        </>
      )}

      <section className="card">
        <h2 className="product-form__title">Get the MrMouse app</h2>
        <p className="secondary" style={{ marginTop: 0 }}>
          The app and the web version use the same MrMouse account and data.
        </p>
        {downloads ?? <span className="badge">Download links coming soon</span>}
      </section>
    </div>
  );
}
