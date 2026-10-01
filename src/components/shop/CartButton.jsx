'use client';

import { useEffect, useRef, useState } from 'react';
import { cartCount, getCart, onCartChange } from './cart';

/**
 * The basket in the storefront header. Its count comes from this browser's
 * basket; it bounces whenever something lands in it.
 */
export default function CartButton() {
  const [count, setCount] = useState(0);
  const [mounted, setMounted] = useState(false);
  const previous = useRef(0);
  const node = useRef(null);

  useEffect(() => {
    setMounted(true);
    const initial = cartCount(getCart());
    previous.current = initial;
    setCount(initial);
    return onCartChange((lines) => {
      const next = cartCount(lines);
      if (next > previous.current && node.current) {
        node.current.classList.remove('is-bumped');
        void node.current.offsetWidth;
        node.current.classList.add('is-bumped');
      }
      previous.current = next;
      setCount(next);
    });
  }, []);

  return (
    <a
      ref={node}
      href="/cart"
      className="cart-btn"
      data-cart-target
      aria-label={mounted ? `Basket, ${count} item${count === 1 ? '' : 's'}` : 'Basket'}
    >
      <svg viewBox="0 0 32 32" aria-hidden="true" className="cart-btn__icon">
        <path d="M5 11 H27 L24.5 26 H7.5 Z" fill="currentColor" opacity="0.14" />
        <path d="M5 11 H27 L24.5 26 H7.5 Z M10 11 Q16 2 22 11" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round" />
        <path d="M10 16 V21 M16 16 V21 M22 16 V21" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
      <span className="cart-btn__label">Basket</span>
      {mounted && count > 0 ? (
        <span className="cart-btn__count" aria-hidden="true">
          {count > 99 ? '99+' : count}
        </span>
      ) : null}
    </a>
  );
}
