'use client';

import { useState } from 'react';
import { addToCart, flyToCart } from './cart';

/**
 * Quantity and "Add to basket" on a product page.
 *
 * Only the product id and a quantity go into the basket. The price shown on
 * the page is the server's; the price charged is the server's again at
 * checkout.
 */
export default function AddToCart({ productId, title, inStock, maxQuantity = null }) {
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(0);

  const max = maxQuantity === null ? 99 : Math.max(1, Math.min(99, maxQuantity));

  function add(event) {
    addToCart(productId, quantity);
    setAdded((n) => n + 1);
    const picture = event.currentTarget.closest('.product')?.querySelector('.product__media');
    flyToCart(picture);
  }

  if (!inStock) {
    return (
      <div className="buy">
        <button type="button" className="btn btn--lg btn--block" disabled>
          Sold out
        </button>
        <p className="buy__note">Message the shop to ask when it&rsquo;s back.</p>
      </div>
    );
  }

  return (
    <div className="buy">
      <div className="buy__row">
        <div className="stepper" role="group" aria-label={`Quantity of ${title}`}>
          <button
            type="button"
            className="stepper__btn"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            disabled={quantity <= 1}
            aria-label="One fewer"
          >
            −
          </button>
          <output className="stepper__value" aria-live="polite">
            {quantity}
          </output>
          <button
            type="button"
            className="stepper__btn"
            onClick={() => setQuantity((q) => Math.min(max, q + 1))}
            disabled={quantity >= max}
            aria-label="One more"
          >
            +
          </button>
        </div>

        <button type="button" className="btn btn--primary btn--lg buy__add" onClick={add}>
          Add to basket
        </button>
      </div>

      <p className="buy__added" role="status" key={added}>
        {added > 0 ? (
          <>
            ✓ Added. <a href="/cart">View basket &amp; check out →</a>
          </>
        ) : (
          ' '
        )}
      </p>
    </div>
  );
}
