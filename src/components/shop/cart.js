'use client';

/**
 * The shopper's basket, kept in this browser.
 *
 * It holds product ids and quantities and NOTHING else — no prices, no
 * titles. Everything a shopper is shown about the basket comes from
 * /api/shop/cart/quote, which reads the database, and checkout reads the
 * database again. There is no field here a tampered basket could use to
 * change what is charged.
 *
 * localStorage is per origin, and every store is its own subdomain, so each
 * store's basket is separate without any keying on our part.
 *
 * Changes are broadcast with a window event so the header's basket count,
 * the product page and the basket page stay in step without a shared React
 * tree (the header is a server component).
 */

const KEY = 'hm-cart-v1';
const EVENT = 'hm-cart-change';
const MAX_QTY = 999;

function read() {
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((line) => line && /^[a-f0-9]{24}$/i.test(line.productId) && Number.isInteger(line.quantity))
      .map((line) => ({ productId: line.productId, quantity: Math.min(Math.max(line.quantity, 1), MAX_QTY) }));
  } catch {
    // Storage blocked (private mode, a strict setting) — an empty basket that
    // still works for this page view is better than an error.
    return [];
  }
}

function write(lines) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(lines));
  } catch {
    // See read().
  }
  window.dispatchEvent(new CustomEvent(EVENT, { detail: lines }));
}

export function getCart() {
  if (typeof window === 'undefined') return [];
  return read();
}

export function cartCount(lines = getCart()) {
  return lines.reduce((sum, line) => sum + line.quantity, 0);
}

export function addToCart(productId, quantity = 1) {
  const lines = read();
  const existing = lines.find((line) => line.productId === productId);
  if (existing) existing.quantity = Math.min(existing.quantity + quantity, MAX_QTY);
  else lines.push({ productId, quantity: Math.min(quantity, MAX_QTY) });
  write(lines);
}

export function setQuantity(productId, quantity) {
  const lines = read()
    .map((line) => (line.productId === productId ? { ...line, quantity: Math.min(quantity, MAX_QTY) } : line))
    .filter((line) => line.quantity > 0);
  write(lines);
}

export function removeFromCart(productIds) {
  const drop = new Set(Array.isArray(productIds) ? productIds : [productIds]);
  write(read().filter((line) => !drop.has(line.productId)));
}

export function clearCart() {
  write([]);
}

/** Subscribe to changes from this tab and from other tabs of the same store. */
export function onCartChange(callback) {
  const local = () => callback(read());
  const storage = (event) => {
    if (event.key === KEY) callback(read());
  };
  window.addEventListener(EVENT, local);
  window.addEventListener('storage', storage);
  return () => {
    window.removeEventListener(EVENT, local);
    window.removeEventListener('storage', storage);
  };
}

/**
 * Fly a picture from the page into the header's basket button.
 *
 * Decoration only, via the Web Animations API (no inline script, nothing for
 * the CSP to object to). Skipped under reduced motion.
 */
export function flyToCart(sourceNode) {
  if (typeof window === 'undefined' || !sourceNode?.animate) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const target = document.querySelector('[data-cart-target]');
  if (!target) return;

  const from = sourceNode.getBoundingClientRect();
  const to = target.getBoundingClientRect();
  const clone = sourceNode.cloneNode(true);
  clone.setAttribute('aria-hidden', 'true');
  Object.assign(clone.style, {
    position: 'fixed',
    left: `${from.left}px`,
    top: `${from.top}px`,
    width: `${from.width}px`,
    height: `${from.height}px`,
    margin: '0',
    zIndex: '80',
    pointerEvents: 'none',
    borderRadius: '18px',
    overflow: 'hidden',
    boxShadow: '0 20px 40px -10px rgb(0 0 0 / 35%)',
  });
  document.body.appendChild(clone);

  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);

  const animation = clone.animate(
    [
      { transform: 'translate(0, 0) scale(1)', opacity: 1, borderRadius: '18px' },
      { transform: `translate(${dx * 0.45}px, ${dy * 0.45 - 60}px) scale(0.45) rotate(-10deg)`, opacity: 1, offset: 0.5 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.06) rotate(10deg)`, opacity: 0.3, borderRadius: '50%' },
    ],
    { duration: 780, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
  );
  animation.onfinish = () => {
    clone.remove();
    target.classList.remove('is-bumped');
    // Force a reflow so the class re-triggers its animation on every add.
    void target.offsetWidth;
    target.classList.add('is-bumped');
  };
  animation.oncancel = () => clone.remove();
}
