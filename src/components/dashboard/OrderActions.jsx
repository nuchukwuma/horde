'use client';

import { useState } from 'react';

/**
 * What a seller does with a paid order: mark it sent (or undo that), and
 * refund it in full. A refund sends money back through Paystack and cannot be
 * undone, so it asks for a reason and a second confirmation; the amount is
 * worked out by the server from what is left to refund, never typed here.
 */
export default function OrderActions({ siteId, orderId, status, fulfilledAt, canFulfil, canRefund }) {
  const [sent, setSent] = useState(Boolean(fulfilledAt));
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [refunding, setRefunding] = useState(false);
  const [reason, setReason] = useState('');
  const [refunded, setRefunded] = useState(false);

  const paid = status === 'paid' || status === 'partially_refunded';

  async function post(path, body) {
    const response = await fetch(`/api/sites/${siteId}/orders/${orderId}/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = Array.isArray(result?.error?.details) ? result.error.details[0]?.message : null;
      throw new Error(detail ?? result?.error?.message ?? 'That did not work. Try again.');
    }
    return result.data;
  }

  async function toggleSent() {
    setBusy('fulfil');
    setError(null);
    try {
      const order = await post('fulfil', { fulfilled: !sent });
      setSent(Boolean(order.fulfilledAt));
    } catch (problem) {
      setError(problem.message);
    } finally {
      setBusy(null);
    }
  }

  async function refund(event) {
    event.preventDefault();
    if (!window.confirm('Refund this order in full? The money goes back to the customer through Paystack. This cannot be undone.')) return;
    setBusy('refund');
    setError(null);
    try {
      await post('refund', { reason: reason.trim() });
      setRefunded(true);
      setRefunding(false);
    } catch (problem) {
      setError(problem.message);
    } finally {
      setBusy(null);
    }
  }

  if (!paid) return null;

  return (
    <div className="order-actions">
      {error ? (
        <div className="alert alert--error" role="alert">
          <span className="alert__icon" aria-hidden="true">!</span>
          <span>{error}</span>
        </div>
      ) : null}
      {refunded ? (
        <div className="alert alert--good" role="status">
          <span className="alert__icon" aria-hidden="true">✓</span>
          <span>Refund started. Paystack returns the money to the customer, usually within a few working days.</span>
        </div>
      ) : null}

      <div className="product-form__actions">
        {canFulfil ? (
          <button type="button" className={`btn ${sent ? 'btn--quiet' : 'btn--primary'}`} onClick={toggleSent} disabled={busy !== null}>
            {busy === 'fulfil' ? 'Saving…' : sent ? 'Mark as not sent' : 'Mark as sent'}
          </button>
        ) : null}
        {canRefund && !refunded && !refunding ? (
          <button type="button" className="btn btn--quiet" onClick={() => setRefunding(true)} disabled={busy !== null}>
            Refund…
          </button>
        ) : null}
      </div>
      {sent ? <p className="hint">✓ Marked as sent.</p> : null}

      {refunding ? (
        <form className="card order-refund" onSubmit={refund}>
          <div className="field">
            <label className="label" htmlFor="refund-reason">
              Why are you refunding?
            </label>
            <input
              id="refund-reason"
              className="input"
              value={reason}
              minLength={3}
              maxLength={500}
              required
              placeholder="e.g. Out of stock"
              onChange={(event) => setReason(event.target.value)}
            />
            <p className="hint">Kept with the order. The full amount still unrefunded goes back to the customer.</p>
          </div>
          <div className="product-form__actions" style={{ marginTop: 14 }}>
            <button type="submit" className="btn btn--danger" disabled={busy !== null || reason.trim().length < 3}>
              {busy === 'refund' ? 'Refunding…' : 'Refund in full'}
            </button>
            <button type="button" className="btn btn--quiet" onClick={() => setRefunding(false)} disabled={busy !== null}>
              Cancel
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
