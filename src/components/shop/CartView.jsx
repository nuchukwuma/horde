'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import ProductArt from '@/components/art/ProductArt';
import { formatNaira } from '@/lib/ui/format';
import TermsCheckbox from '@/components/legal/TermsCheckbox';
import { NIGERIAN_STATES, normaliseNigerianPhone } from '@/lib/shop/nigeria';
import { getCart, onCartChange, removeFromCart, setQuantity } from './cart';
import { imageUrlAt } from '@/lib/media/responsiveImage';

/**
 * The basket and checkout.
 *
 * Every figure on this page comes from /api/shop/cart/quote — the database's
 * prices, not anything stored in the browser — and checkout prices the order
 * again from scratch. What the shopper types is who they are and where the
 * order goes — email for the receipt, name and phone so the seller can reach
 * them, and an address unless they are collecting it themselves. A signed-in
 * shopper's email comes from their account.
 */

const BLOCKED_COPY = {
  payout_not_verified: 'This shop is still setting up payments, so checkout is not open yet.',
  no_subaccount: 'This shop is still setting up payments, so checkout is not open yet.',
  new_seller_hold: 'This shop is new and opens for payments shortly. Your basket will keep.',
  prohibited_products_flagged: 'Checkout is paused for this shop while it is reviewed.',
  site_not_active: 'This shop is not taking orders right now.',
};

export default function CartView({ storeName, shopper, privacyUrl = '/privacy', termsUrl = '/terms' }) {
  const [lines, setLines] = useState(null);
  const [quote, setQuote] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState(null);
  const [email, setEmail] = useState(shopper?.email ?? '');
  const [name, setName] = useState(shopper?.name ?? '');
  const [phone, setPhone] = useState('');
  const [method, setMethod] = useState('delivery');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [region, setRegion] = useState('');
  const [note, setNote] = useState('');
  const [phoneError, setPhoneError] = useState(null);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [error, setError] = useState(null);
  const [paying, setPaying] = useState(false);
  const seq = useRef(0);

  const refresh = useCallback(async (current) => {
    if (current.length === 0) {
      setQuote(null);
      setLoading(false);
      return;
    }

    const mine = ++seq.current;
    setLoading(true);
    try {
      const response = await fetch('/api/shop/cart/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: current }),
        cache: 'no-store',
      });
      const body = await response.json();
      if (mine !== seq.current) return;
      if (!response.ok) throw new Error(body?.error?.message ?? 'Could not price your basket');

      if (body.data.removedProductIds.length > 0) {
        removeFromCart(body.data.removedProductIds);
        setNotice('Something in your basket is no longer sold here, so we took it out.');
      }
      setQuote(body.data);
    } catch (problem) {
      if (mine !== seq.current) return;
      setError(problem.message);
    } finally {
      if (mine === seq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = getCart();
    setLines(initial);
    refresh(initial);
    return onCartChange((next) => {
      setLines(next);
      refresh(next);
    });
  }, [refresh]);

  async function checkout(event) {
    event.preventDefault();
    setError(null);
    if (!normaliseNigerianPhone(phone)) {
      setPhoneError('Enter a Nigerian mobile number, like 0803 123 4567.');
      document.getElementById('checkout-phone')?.focus();
      return;
    }
    setPhoneError(null);
    setPaying(true);

    try {
      const response = await fetch('/api/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Ids and quantities only. Any price here would be ignored anyway.
        body: JSON.stringify({
          items: lines,
          customerEmail: email,
          customerName: name.trim(),
          customerPhone: phone,
          delivery:
            method === 'delivery'
              ? { method, address, city, state: region, note: note.trim() || undefined }
              : { method, note: note.trim() || undefined },
          acceptTerms,
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        const detail = Array.isArray(body?.error?.details) ? body.error.details[0]?.message : null;
        setError(detail ?? body?.error?.message ?? 'Could not start checkout');
        setPaying(false);
        refresh(getCart());
        return;
      }
      // Paystack's hosted page. The basket is cleared on the receipt page,
      // once payment is confirmed — not here, in case they come back.
      window.location.href = body.data.authorizationUrl;
    } catch {
      setError('Could not reach the server. Check your connection and try again.');
      setPaying(false);
    }
  }

  if (lines === null) {
    return <div className="cart__skeleton" aria-busy="true" />;
  }

  if (lines.length === 0) {
    return (
      <div className="cart-empty">
        <svg className="cart-empty__basket" viewBox="0 0 160 130" aria-hidden="true">
          <ellipse cx="80" cy="120" rx="54" ry="7" fill="var(--line)" opacity="0.12" />
          <g className="cart-empty__swing">
            <path d="M44 34 Q80 -14 116 34" fill="none" stroke="var(--line)" strokeWidth="5" strokeLinecap="round" />
            <path d="M24 40 H136 L124 112 H36 Z" fill="var(--wood)" stroke="var(--line)" strokeWidth="5" strokeLinejoin="round" />
            <path d="M30 62 H130 M33 86 H127" stroke="var(--wood-dark)" strokeWidth="5" />
            <circle cx="62" cy="76" r="3" fill="var(--line)" />
            <circle cx="98" cy="76" r="3" fill="var(--line)" />
            <path d="M70 96 Q80 88 90 96" fill="none" stroke="var(--line)" strokeWidth="3.5" strokeLinecap="round" />
          </g>
        </svg>
        <h2 className="cart-empty__title">Your basket is empty</h2>
        <p className="muted">Everything at {storeName} is a tap away.</p>
        <a className="btn btn--primary btn--lg" href="/shop">
          Browse the shop
        </a>
      </div>
    );
  }

  const blocked = quote && !quote.canCheckout && quote.blockedReason;
  const hasProblem = quote?.lines.some((line) => line.problem);

  return (
    <div className="cart">
      <section className="cart__lines" aria-label="Items in your basket" aria-busy={loading}>
        {notice ? (
          <div className="alert alert--warning" role="status">
            <span className="alert__icon" aria-hidden="true">!</span>
            <span>{notice}</span>
          </div>
        ) : null}

        <ul className="cart-lines">
          {(quote?.lines ?? []).map((line) => (
            <li key={line.productId} className={`cart-line${line.problem ? ' cart-line--problem' : ''}`}>
              <a className="cart-line__media" href={`/shop/${line.slug}`} tabIndex={-1} aria-hidden="true">
                {line.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imageUrlAt({ url: line.imageUrl }, 160)} alt="" loading="lazy" decoding="async" />
                ) : (
                  <ProductArt title={line.title} seed={line.productId} label="" />
                )}
              </a>
              <div className="cart-line__info">
                <a className="cart-line__title" href={`/shop/${line.slug}`}>
                  {line.title}
                </a>
                <span className="cart-line__unit money">{formatNaira(line.unitPriceKobo)} each</span>
                {line.problem === 'unavailable' ? (
                  <span className="cart-line__problem">Sold out — remove it to check out.</span>
                ) : null}
                {line.problem === 'insufficient_stock' ? (
                  <span className="cart-line__problem">Only {line.maxQuantity} left — lower the quantity.</span>
                ) : null}
                <div className="cart-line__controls">
                  <div className="stepper stepper--sm" role="group" aria-label={`Quantity of ${line.title}`}>
                    <button
                      type="button"
                      className="stepper__btn"
                      onClick={() => setQuantity(line.productId, line.quantity - 1)}
                      aria-label="One fewer"
                    >
                      −
                    </button>
                    <output className="stepper__value">{line.quantity}</output>
                    <button
                      type="button"
                      className="stepper__btn"
                      onClick={() => setQuantity(line.productId, line.quantity + 1)}
                      disabled={line.maxQuantity !== null && line.quantity >= line.maxQuantity}
                      aria-label="One more"
                    >
                      +
                    </button>
                  </div>
                  <button type="button" className="btn btn--ghost btn--sm" onClick={() => removeFromCart(line.productId)}>
                    Remove
                  </button>
                </div>
              </div>
              <span className="cart-line__total money">{formatNaira(line.lineTotalKobo)}</span>
            </li>
          ))}
        </ul>
      </section>

      <aside className="cart__summary card" aria-label="Order summary">
        <h2 className="cart__summary-title">Order summary</h2>
        <dl className="cart__totals">
          <div>
            <dt>Subtotal</dt>
            <dd className="money">{quote ? formatNaira(quote.subtotalKobo) : '…'}</dd>
          </div>
          <div>
            <dt>Delivery</dt>
            <dd>Arranged with {storeName}</dd>
          </div>
          <div className="cart__grand">
            <dt>Total</dt>
            <dd className="money">{quote ? formatNaira(quote.subtotalKobo) : '…'}</dd>
          </div>
        </dl>

        {blocked ? (
          <div className="alert alert--info" role="status">
            <span className="alert__icon" aria-hidden="true">i</span>
            <span>{BLOCKED_COPY[quote.blockedReason] ?? 'Checkout is not open at this shop yet.'}</span>
          </div>
        ) : null}

        <form onSubmit={checkout} className="cart__form">
          {error ? (
            <div className="alert alert--error" role="alert">
              <span className="alert__icon" aria-hidden="true">!</span>
              <span>{error}</span>
            </div>
          ) : null}

          <div className="field">
            <label className="label" htmlFor="checkout-email">
              Email for your receipt
            </label>
            <input
              id="checkout-email"
              type="email"
              className="input"
              autoComplete="email"
              required
              value={email}
              readOnly={Boolean(shopper)}
              onChange={(event) => setEmail(event.target.value)}
            />
            {shopper ? <p className="hint">Signed in as {shopper.email}.</p> : null}
          </div>

          <div className="field">
            <label className="label" htmlFor="checkout-name">
              Your name
            </label>
            <input
              id="checkout-name"
              className="input"
              autoComplete="name"
              minLength={2}
              maxLength={200}
              required
              value={name}
              readOnly={Boolean(shopper?.name)}
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="field">
            <label className="label" htmlFor="checkout-phone">
              Phone number
            </label>
            <input
              id="checkout-phone"
              type="tel"
              className="input"
              autoComplete="tel"
              inputMode="tel"
              placeholder="0803 123 4567"
              maxLength={24}
              required
              value={phone}
              aria-invalid={phoneError ? 'true' : undefined}
              aria-describedby="checkout-phone-hint"
              onChange={(event) => {
                setPhone(event.target.value);
                if (phoneError) setPhoneError(null);
              }}
            />
            <p id="checkout-phone-hint" className={`hint${phoneError ? ' hint--error' : ''}`}>
              {phoneError ?? `So ${storeName} can reach you about delivery.`}
            </p>
          </div>

          <fieldset className="field cart__method">
            <legend className="label">How you’ll get it</legend>
            <label className="checkbox">
              <input type="radio" name="delivery-method" value="delivery" checked={method === 'delivery'} onChange={() => setMethod('delivery')} />
              <span>Deliver it to me</span>
            </label>
            <label className="checkbox">
              <input type="radio" name="delivery-method" value="pickup" checked={method === 'pickup'} onChange={() => setMethod('pickup')} />
              <span>I’ll collect it, or nothing needs delivering</span>
            </label>
          </fieldset>

          {method === 'delivery' ? (
            <>
              <div className="field">
                <label className="label" htmlFor="checkout-address">
                  Delivery address
                </label>
                <input
                  id="checkout-address"
                  className="input"
                  autoComplete="street-address"
                  placeholder="House number, street, area"
                  minLength={5}
                  maxLength={300}
                  required
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                />
              </div>
              <div className="cart__row">
                <div className="field">
                  <label className="label" htmlFor="checkout-city">
                    Town or city
                  </label>
                  <input
                    id="checkout-city"
                    className="input"
                    autoComplete="address-level2"
                    minLength={2}
                    maxLength={100}
                    required
                    value={city}
                    onChange={(event) => setCity(event.target.value)}
                  />
                </div>
                <div className="field">
                  <label className="label" htmlFor="checkout-state">
                    State
                  </label>
                  <select
                    id="checkout-state"
                    className="select"
                    autoComplete="address-level1"
                    required
                    value={region}
                    onChange={(event) => setRegion(event.target.value)}
                  >
                    <option value="">Choose</option>
                    {NIGERIAN_STATES.map((state) => (
                      <option key={state} value={state}>
                        {state}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </>
          ) : null}

          <div className="field">
            <label className="label" htmlFor="checkout-note">
              Note for {storeName} <span className="muted">(optional)</span>
            </label>
            <textarea
              id="checkout-note"
              className="textarea"
              rows={2}
              maxLength={500}
              placeholder={method === 'delivery' ? 'Landmark, best time to call…' : 'When you’ll collect, sizes…'}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              style={{ minHeight: 72 }}
            />
          </div>

          <div style={{ marginTop: 16 }}>
            <TermsCheckbox id="checkout-terms" checked={acceptTerms} onChange={setAcceptTerms} termsUrl={termsUrl} privacyUrl={privacyUrl} />
          </div>

          <button
            type="submit"
            className="btn btn--primary btn--lg btn--block"
            disabled={paying || loading || !quote || !quote.canCheckout || hasProblem || !acceptTerms}
          >
            {paying ? (
              <>
                <span className="btn__spinner" aria-hidden="true" /> Opening Paystack…
              </>
            ) : (
              <>Pay {quote ? formatNaira(quote.subtotalKobo) : ''} securely</>
            )}
          </button>

          <p className="cart__secure">
            <span aria-hidden="true">🔒</span> Card, bank transfer or USSD, via Paystack. Your payment goes to{' '}
            {storeName} directly.
          </p>
          <p className="cart__secure">Your details go only to {storeName}, to get your order to you.</p>
          {!shopper ? (
            <p className="cart__secure">
              No account needed. <a href="/account/login">Sign in</a> to keep your orders together.
            </p>
          ) : null}
        </form>
      </aside>
    </div>
  );
}
