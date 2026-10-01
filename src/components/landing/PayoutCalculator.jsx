'use client';

import { useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { computeSplit } from '@/lib/payments/computeSplit';
import { nairaToKobo } from '@/lib/money/kobo';
import { formatNaira } from '@/lib/ui/format';
import { FEES_ARE_PLACEHOLDERS, PLANS } from '@/config/fees';

/**
 * "If a customer pays me ₦X, what lands in my account?"
 *
 * Computed by computeSplit — the function checkout uses — fed from
 * src/config/fees.ts, the single file of (currently placeholder) rates. The
 * page says plainly that the rates are placeholders, because a seller will
 * screenshot this and hold us to it.
 *
 * The amount is parsed by nairaToKobo, never parseFloat: ₦1,000.10 must be
 * 100,010 kobo, not 100,009.99999.
 */

const PLAN = PLANS.free;
const MAX_KOBO = 100_000_000_00; // ₦100m: beyond that, talk to us.

function parseAmount(raw) {
  const cleaned = String(raw).replace(/[,\s₦]/g, '');
  if (!/^\d{1,9}(\.\d{0,2})?$/.test(cleaned)) return null;
  const kobo = nairaToKobo(cleaned.endsWith('.') ? cleaned.slice(0, -1) : cleaned);
  return kobo > 0 && kobo <= MAX_KOBO ? kobo : null;
}

/** Tween a displayed kobo figure toward its new value. Display only. */
function TweenedNaira({ kobo, className }) {
  const node = useRef(null);
  const shown = useRef(kobo);

  useEffect(() => {
    const el = node.current;
    if (!el) return undefined;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      shown.current = kobo;
      el.textContent = formatNaira(kobo);
      return undefined;
    }
    const state = { value: shown.current };
    const tween = gsap.to(state, {
      value: kobo,
      duration: 0.5,
      ease: 'power2.out',
      onUpdate: () => {
        shown.current = Math.round(state.value);
        el.textContent = formatNaira(shown.current);
      },
    });
    return () => tween.kill();
  }, [kobo]);

  return (
    <span ref={node} className={`money ${className ?? ''}`}>
      {formatNaira(kobo)}
    </span>
  );
}

export default function PayoutCalculator() {
  const [raw, setRaw] = useState('25,000');
  const kobo = parseAmount(raw);
  const split = kobo ? computeSplit(kobo, PLAN) : null;

  const pct = (part) => (split ? Math.max(0, Math.min(1, part / split.gross)) : 0);

  return (
    <div className="calc">
      <div className="calc__input">
        <label className="label" htmlFor="calc-amount">
          A customer pays you
        </label>
        <div className="input-group">
          <span className="input-group__prefix">₦</span>
          <input
            id="calc-amount"
            className="input calc__field"
            inputMode="decimal"
            autoComplete="off"
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
            aria-describedby="calc-hint"
            aria-invalid={kobo ? undefined : 'true'}
          />
        </div>
        <p className="hint" id="calc-hint">
          {kobo ? 'Try the price of something you sold this week.' : 'Enter an amount like 25000 or 25,000.50.'}
        </p>
      </div>

      <div className="calc__result" aria-live="polite">
        <div className="calc__bars" aria-hidden="true">
          <span className="calc__bar calc__bar--net" style={{ transform: `scaleX(${pct(split?.sellerNet ?? 0)})` }} />
          <span className="calc__bar calc__bar--fee" style={{ transform: `scaleX(${pct(split?.paystackFee ?? 0)})` }} />
          <span className="calc__bar calc__bar--cut" style={{ transform: `scaleX(${pct(split?.platformFee ?? 0)})` }} />
        </div>

        <dl className="calc__rows">
          <div>
            <dt>Payment processing fee</dt>
            <dd>{split ? <TweenedNaira kobo={split.paystackFee} /> : '—'}</dd>
          </div>
          <div>
            <dt>HordeMart commission ({PLAN.feePercentBps / 100}%)</dt>
            <dd>{split ? <TweenedNaira kobo={split.platformFee} /> : '—'}</dd>
          </div>
          <div className="calc__net">
            <dt>Paid into your bank</dt>
            <dd>{split ? <TweenedNaira kobo={split.sellerNet} /> : '—'}</dd>
          </div>
        </dl>

        {FEES_ARE_PLACEHOLDERS ? (
          <p className="calc__placeholder">
            <strong>Placeholder rates.</strong> These figures use example rates while pricing is
            being finalised. They are not a quote.
          </p>
        ) : null}
      </div>
    </div>
  );
}
