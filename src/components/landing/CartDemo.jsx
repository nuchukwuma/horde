'use client';

import { useRef, useState } from 'react';
import ProductArt from '@/components/art/ProductArt';
import { computeSplit } from '@/lib/payments/computeSplit';
import { formatNaira } from '@/lib/ui/format';

/**
 * Be the customer for a minute.
 *
 * Tap products into the basket and watch where the money would go. The split
 * is not a mock: it is computed by the same computeSplit that prices real
 * checkouts, with the free plan's published terms, so the toy cannot drift
 * from what a seller is actually charged.
 *
 * The fly-to-basket effect uses the Web Animations API on a clone of the
 * product picture. It is decoration: the basket count and total update
 * immediately and are announced, and the clone is skipped entirely when the
 * visitor prefers reduced motion.
 */

const FREE_PLAN = {
  feePercentBps: 700,
  feeFlatKobo: 0,
  feeCapKobo: null,
  vatOnPlatformFeeBps: 0,
  paystackFeeBearer: 'seller',
};

const DEMO_PRODUCTS = [
  { id: 'adire', title: 'Adire wrapper, indigo', priceKobo: 1_850_000 },
  { id: 'shea', title: 'Whipped shea butter', priceKobo: 420_000 },
  { id: 'beads', title: 'Coral bead necklace', priceKobo: 780_000 },
  { id: 'slides', title: 'Leather slides shoes', priceKobo: 1_200_000 },
];

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export default function CartDemo() {
  const [basket, setBasket] = useState({});
  const [bump, setBump] = useState(0);
  const [paid, setPaid] = useState(false);
  const basketRef = useRef(null);

  const count = Object.values(basket).reduce((sum, qty) => sum + qty, 0);
  const subtotal = DEMO_PRODUCTS.reduce((sum, p) => sum + (basket[p.id] ?? 0) * p.priceKobo, 0);
  const split = subtotal > 0 ? computeSplit(subtotal, FREE_PLAN) : null;

  function fly(fromNode) {
    const target = basketRef.current;
    if (!fromNode || !target || prefersReducedMotion() || !fromNode.animate) return;

    const from = fromNode.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    const clone = fromNode.cloneNode(true);
    clone.setAttribute('aria-hidden', 'true');
    Object.assign(clone.style, {
      position: 'fixed',
      left: `${from.left}px`,
      top: `${from.top}px`,
      width: `${from.width}px`,
      height: `${from.height}px`,
      margin: '0',
      zIndex: '60',
      pointerEvents: 'none',
      borderRadius: '14px',
      overflow: 'hidden',
    });
    document.body.appendChild(clone);

    const dx = to.left + to.width / 2 - (from.left + from.width / 2);
    const dy = to.top + to.height / 2 - (from.top + from.height / 2);

    const animation = clone.animate(
      [
        { transform: 'translate(0, 0) scale(1) rotate(0deg)', opacity: 1 },
        { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 90}px) scale(0.55) rotate(-12deg)`, opacity: 1, offset: 0.55 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.12) rotate(8deg)`, opacity: 0.4 },
      ],
      { duration: 720, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    );
    animation.onfinish = () => clone.remove();
    animation.oncancel = () => clone.remove();
  }

  function add(product, event) {
    if (paid) return;
    const tile = event.currentTarget.closest('.demo-product')?.querySelector('.demo-product__art');
    fly(tile);
    setBasket((current) => ({ ...current, [product.id]: (current[product.id] ?? 0) + 1 }));
    setBump((n) => n + 1);
  }

  function reset() {
    setBasket({});
    setPaid(false);
  }

  const share = (part) => (split ? `${Math.max(2, Math.round((part / split.gross) * 100))}%` : '0%');

  return (
    <div className="demo">
      <ul className="demo__products">
        {DEMO_PRODUCTS.map((product) => (
          <li key={product.id} className="demo-product">
            <div className="demo-product__art">
              <ProductArt title={product.title} seed={product.id} className="demo-product__svg" />
            </div>
            <div className="demo-product__meta">
              <span className="demo-product__title">{product.title}</span>
              <span className="money demo-product__price">{formatNaira(product.priceKobo)}</span>
            </div>
            <button
              type="button"
              className="btn btn--primary btn--sm btn--block"
              onClick={(event) => add(product, event)}
              disabled={paid}
            >
              Add to basket
            </button>
          </li>
        ))}
      </ul>

      <aside className="demo__checkout" aria-label="Demo basket">
        <div className="demo__basket-row">
          <div ref={basketRef} key={bump} className={`demo__basket${bump ? ' is-bumped' : ''}`}>
            <svg viewBox="0 0 80 64" aria-hidden="true">
              <path d="M14 26 L66 26 L60 58 L20 58 Z" fill="var(--wood)" stroke="var(--line)" strokeWidth="3" strokeLinejoin="round" />
              <path d="M18 38 H62 M20 48 H60" stroke="var(--wood-dark)" strokeWidth="3" />
              <path d="M24 26 Q40 2 56 26" fill="none" stroke="var(--line)" strokeWidth="3.5" />
              {count > 0 ? <circle cx="34" cy="22" r="7" fill="var(--palm)" stroke="var(--line)" strokeWidth="2.5" /> : null}
              {count > 1 ? <circle cx="47" cy="21" r="6" fill="var(--sun)" stroke="var(--line)" strokeWidth="2.5" /> : null}
              {count > 2 ? <rect x="38" y="12" width="10" height="12" rx="2" fill="var(--indigo)" stroke="var(--line)" strokeWidth="2.5" /> : null}
            </svg>
            <span className="demo__count" aria-hidden="true">
              {count}
            </span>
          </div>
          <div>
            <p className="demo__label">Basket</p>
            <p className="demo__total money" role="status">
              {count === 0 ? 'Empty — add something' : `${count} item${count === 1 ? '' : 's'} · ${formatNaira(subtotal)}`}
            </p>
          </div>
        </div>

        <div className="demo__split" aria-live="polite">
          <div className="splitbar" aria-hidden="true">
            <span className="splitbar__seg splitbar__seg--seller" style={{ width: split ? share(split.sellerNet) : '100%' }} />
            <span className="splitbar__seg splitbar__seg--paystack" style={{ width: split ? share(split.paystackFee) : '0%' }} />
            <span className="splitbar__seg splitbar__seg--platform" style={{ width: split ? share(split.platformFee) : '0%' }} />
          </div>
          <dl className="demo__legend">
            <div>
              <dt>
                <i className="dot dot--seller" /> Seller gets
              </dt>
              <dd className="money">{split ? formatNaira(split.sellerNet) : '—'}</dd>
            </div>
            <div>
              <dt>
                <i className="dot dot--paystack" /> Paystack fee
              </dt>
              <dd className="money">{split ? formatNaira(split.paystackFee) : '—'}</dd>
            </div>
            <div>
              <dt>
                <i className="dot dot--platform" /> HordeMart (7%)
              </dt>
              <dd className="money">{split ? formatNaira(split.platformFee) : '—'}</dd>
            </div>
          </dl>
        </div>

        {paid ? (
          <div className="receipt" role="status">
            <div className="confetti" aria-hidden="true">
              {Array.from({ length: 18 }, (_, i) => (
                <i
                  key={i}
                  style={{
                    '--x': `${(i * 53) % 100}%`,
                    '--d': `${(i % 6) * 60}ms`,
                    '--c': ['var(--sun)', 'var(--palm)', 'var(--accent)', 'var(--indigo)', 'var(--clay)'][i % 5],
                    '--sway': `${((i % 5) - 2) * 18}px`,
                  }}
                />
              ))}
            </div>
            <div className="receipt__check" aria-hidden="true">
              ✓
            </div>
            <p className="receipt__title">Paid · {formatNaira(subtotal)}</p>
            <p className="receipt__body">
              {formatNaira(split.sellerNet)} is on its way to the seller&rsquo;s bank. It never sat
              with us.
            </p>
            <button type="button" className="btn btn--quiet btn--sm" onClick={reset}>
              Shop again
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn--sun btn--lg btn--block"
            disabled={count === 0}
            onClick={() => setPaid(true)}
          >
            Pay {count ? formatNaira(subtotal) : ''} (demo)
          </button>
        )}
        <p className="demo__note">A demo — nothing is charged. Real checkouts run through Paystack.</p>
      </aside>
    </div>
  );
}
