'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import AdirePattern from '@/components/design/AdirePattern';
import ProductArt from '@/components/art/ProductArt';
import { formatNaira } from '@/lib/ui/format';
import { DEMO_CATEGORIES } from './demoCatalog';

gsap.registerPlugin(useGSAP);

/**
 * "Launch your store", live.
 *
 * Type a shop name: the phone beside it becomes that shop — its name in the
 * header, its address in the bar, and a strip of adire cloth dyed from the
 * letters of the name. Pick what you sell: the stock and the dye change.
 *
 * Motion, per the brief: ONE orchestrated sequence when the page loads (the
 * headline unrolls, the phone rises, the cloth is stamped square by square,
 * the stock drops onto the shelf), and after that only motion that answers
 * the visitor — re-stamping the cloth when the name changes, restocking when
 * the category changes. Transform and opacity only. Under
 * prefers-reduced-motion, gsap.matchMedia skips all of it and the finished
 * page is simply there.
 *
 * GSAP lives on this marketing page only — never in storefronts or the store
 * editor (see the licensing note in the PR).
 */

function toSlug(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30);
}

function useDebounced(value, delay) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return settled;
}

export default function LaunchDemo({ rootDomain = 'hordemart.com' }) {
  const scope = useRef(null);
  const reduced = useRef(true);
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState('fashion');

  const category = useMemo(
    () => DEMO_CATEGORIES.find((entry) => entry.id === categoryId) ?? DEMO_CATEGORIES[0],
    [categoryId],
  );
  const shopName = name.trim() || 'Ade Fabrics';
  const slug = toSlug(name) || 'ade-fabrics';
  const clothName = useDebounced(shopName, 140);

  // The one orchestrated sequence.
  const { contextSafe } = useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(
        { motion: '(prefers-reduced-motion: no-preference)', still: '(prefers-reduced-motion: reduce)' },
        (context) => {
          reduced.current = Boolean(context.conditions?.still);
          if (reduced.current) return;

          gsap
            .timeline({ defaults: { ease: 'power3.out' } })
            .from('.launch__line > span', { yPercent: 105, duration: 0.85, stagger: 0.12, ease: 'power4.out' })
            .from('.launch__lede', { y: 14, opacity: 0, duration: 0.5 }, '-=0.45')
            .from('.launch__form', { y: 14, opacity: 0, duration: 0.5 }, '-=0.35')
            .from('.device', { y: 70, rotate: 3, opacity: 0, duration: 0.95 }, 0.15)
            .from(
              '.device .adire__tile',
              { scale: 0, transformOrigin: '50% 50%', duration: 0.42, stagger: { each: 0.035, from: 'random' }, ease: 'back.out(2.2)' },
              '-=0.45',
            )
            .from('.device .mini-product', { y: 26, opacity: 0, duration: 0.5, stagger: 0.09 }, '-=0.25')
            .from('.device .mini-pay', { y: 16, opacity: 0, duration: 0.4 }, '-=0.2');
        },
      );
    },
    { scope },
  );

  // Re-stamp the cloth when the name settles.
  const restamp = contextSafe(() => {
    if (reduced.current) return;
    gsap.fromTo(
      '.device .adire__tile',
      { scale: 0.35, opacity: 0.2, transformOrigin: '50% 50%' },
      { scale: 1, opacity: 1, duration: 0.38, stagger: { each: 0.022, from: 'start' }, ease: 'back.out(2)', overwrite: true },
    );
    gsap.fromTo('.device .mini-name', { y: -6 }, { y: 0, duration: 0.4, ease: 'back.out(3)', overwrite: true });
  });

  // Restock when the category changes.
  const restock = contextSafe(() => {
    if (reduced.current) return;
    gsap.fromTo(
      '.device .mini-product',
      { y: -28, opacity: 0, rotate: -4 },
      { y: 0, opacity: 1, rotate: 0, duration: 0.5, stagger: 0.07, ease: 'back.out(1.8)', overwrite: true },
    );
    restamp();
  });

  // contextSafe hands back a new function every render, so the effects call
  // the latest one through refs and depend only on the inputs that matter.
  const restampRef = useRef(restamp);
  const restockRef = useRef(restock);
  restampRef.current = restamp;
  restockRef.current = restock;

  const mounted = useRef({ name: false, category: false });
  useEffect(() => {
    if (!mounted.current.name) {
      mounted.current.name = true;
      return;
    }
    restampRef.current();
  }, [clothName]);

  useEffect(() => {
    if (!mounted.current.category) {
      mounted.current.category = true;
      return;
    }
    restockRef.current();
  }, [categoryId]);

  const claimHref = `/signup?slug=${encodeURIComponent(slug)}`;

  return (
    <div className="launch" ref={scope}>
      <div className="launch__copy">
        <h1 className="launch__title">
          <span className="launch__line">
            <span>Sell from your own address,</span>
          </span>{' '}
          <span className="launch__line">
            <span>not from your DMs.</span>
          </span>
        </h1>
        <p className="launch__lede">
          Type your shop&rsquo;s name and see the store your WhatsApp customers will get: prices in
          naira, checkout by card, bank transfer or USSD through Paystack, and the money paid into
          your own bank account.
        </p>

        <form
          className="launch__form"
          action="/signup"
          method="get"
          onSubmit={(event) => {
            event.preventDefault();
            window.location.href = claimHref;
          }}
        >
          <label className="label" htmlFor="launch-name">
            Your shop&rsquo;s name
          </label>
          <input
            id="launch-name"
            name="slug"
            className="input launch__input"
            placeholder="Ade Fabrics"
            maxLength={40}
            autoComplete="organization"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />

          <fieldset className="launch__cats">
            <legend className="label">What do you sell?</legend>
            <div className="launch__chips">
              {DEMO_CATEGORIES.map((entry) => (
                <label key={entry.id} className={`chip${entry.id === categoryId ? ' is-on' : ''}`}>
                  <input
                    type="radio"
                    name="category"
                    value={entry.id}
                    checked={entry.id === categoryId}
                    onChange={() => setCategoryId(entry.id)}
                  />
                  <span className="chip__swatch" style={{ background: entry.ink }} aria-hidden="true" />
                  {entry.label}
                </label>
              ))}
            </div>
          </fieldset>

          <button className="btn btn--primary btn--lg launch__claim" type="submit">
            Claim {slug}.{rootDomain}
          </button>
          <p className="launch__note" role="status">
            {name.trim()
              ? `Free to open. Customers would find you at ${slug}.${rootDomain}.`
              : 'Free to open. No monthly fee — you can change the name later.'}
          </p>
        </form>
      </div>

      <div className="launch__stage" aria-label={`Preview of ${shopName}`} role="img">
        <div className="device" style={{ '--demo-accent': category.accent, '--demo-accent-ink': category.accentInk }}>
          <div className="device__bar">
            <span className="device__lock" aria-hidden="true" />
            <span className="device__url">
              <strong>{slug}</strong>.{rootDomain}
            </span>
          </div>

          <div className="device__screen">
            <header className="mini-head">
              <span className="mini-mark" style={{ background: category.ink }}>
                {shopName
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((word) => word[0])
                  .join('')
                  .toUpperCase()}
              </span>
              <span className="mini-name">{shopName}</span>
            </header>

            <div className="mini-cloth">
              <AdirePattern name={clothName} columns={6} count={12} ink={category.ink} resist={category.resist} className="mini-cloth__svg" />
            </div>

            <ul className="mini-products">
              {category.products.map((product) => (
                <li key={`${category.id}-${product.title}`} className="mini-product">
                  <div className="mini-product__art">
                    <ProductArt title={product.title} seed={`${category.id}${product.title}`} label="" />
                  </div>
                  <span className="mini-product__title">{product.title}</span>
                  <span className="mini-product__price money">{formatNaira(product.priceKobo)}</span>
                </li>
              ))}
            </ul>

            <div className="mini-pay">
              <span className="mini-pay__btn">Pay with Paystack</span>
              <span className="mini-pay__note">Card, transfer or USSD</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
