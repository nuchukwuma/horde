'use client';

import { useEffect, useRef, useState } from 'react';
import StallScene from '@/components/scenes/StallScene';

/**
 * Type a shop name; watch a stall get built and stocked with it on the sign.
 *
 * This is the landing page's one big idea, and it does real work: whatever is
 * typed is carried into /signup as the proposed address, so the first thing a
 * seller does here is the first thing they would have done in the form.
 *
 * The animation is a sequence of `stage` values handed to StallScene; each
 * stage is a CSS transition, so there is no animation library and nothing for
 * the CSP to object to. "Restock" replays the stocking for anyone who wants to
 * see it again — it is a toy, and toys get played with.
 */

/** Mirrors slugSchema loosely; the server decides. */
function toSlug(value) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-/, '')
    .slice(0, 30);
}

const BUILD = [
  [1, 250],
  [2, 750],
  [3, 1500],
  [4, 2900],
  [5, 3500],
];

export default function HeroPlayground({ rootDomain = 'hordemart.com' }) {
  const [name, setName] = useState('');
  const [stage, setStage] = useState(0);
  const timers = useRef([]);

  function run(steps) {
    timers.current.forEach(clearTimeout);
    timers.current = steps.map(([value, at]) => setTimeout(() => setStage(value), at));
  }

  useEffect(() => {
    run(BUILD);
    return () => timers.current.forEach(clearTimeout);
  }, []);

  function restock() {
    setStage(2);
    run([
      [3, 350],
      [4, 1700],
      [5, 2300],
    ]);
  }

  const slug = toSlug(name);
  const shown = slug || 'your-shop';
  const href = slug ? `/signup?slug=${encodeURIComponent(slug)}` : '/signup';
  const display = name.trim() || 'Your shop';

  return (
    <div className="playground">
      <div className="scene playground__scene">
        <StallScene name={display} stage={stage} />

        <div className={`scene__toast${stage >= 5 ? ' on' : ''}`} aria-hidden="true">
          <span className="scene__toast-icon">₦</span>
          <span>
            <strong>New order · ₦18,500</strong>
            <span className="muted">Paid by card. Settling to your bank.</span>
          </span>
        </div>

        <div className="scene__controls">
          <button type="button" className="scene__chip" onClick={restock}>
            ↻ Restock
          </button>
        </div>

        <div className="scene__address" aria-hidden="true">
          <span aria-hidden="true">🔒</span>
          <span>
            <span className="scene__address-slug">{shown}</span>.{rootDomain}
          </span>
        </div>
      </div>

      <form className="claim" action="/signup" method="get" onSubmit={(event) => {
        event.preventDefault();
        window.location.href = href;
      }}>
        <label htmlFor="shop-name" className="claim__label">
          What do you sell as?
        </label>
        <div className="claim__row">
          <input
            id="shop-name"
            name="slug"
            className="input claim__input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ade Stores"
            maxLength={40}
            autoComplete="organization"
          />
          <button className="btn btn--sun btn--lg" type="submit">
            Claim it →
          </button>
        </div>
        {/* Announced, so the address is available without watching the sign. */}
        <p role="status" className="claim__status">
          {slug ? (
            <>
              Your customers would visit <strong>{shown}.{rootDomain}</strong>
            </>
          ) : (
            'Free to start. No monthly fee. You can change the name later.'
          )}
        </p>
      </form>
    </div>
  );
}
