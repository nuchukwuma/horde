'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { clearCart } from './cart';

/**
 * Side effects of the receipt page, kept out of the server component.
 *
 * Paid: empty the basket — the order exists now, and a basket still holding
 * it invites paying twice. Pending: re-check every few seconds, because
 * Paystack's redirect often beats its webhook; give up after a minute and
 * leave the "we'll email you" message standing.
 */
export default function ReceiptEffects({ status }) {
  const router = useRouter();

  useEffect(() => {
    if (status === 'paid') clearCart();
  }, [status]);

  useEffect(() => {
    if (status !== 'pending') return undefined;
    let tries = 0;
    const timer = setInterval(() => {
      tries += 1;
      if (tries > 12) {
        clearInterval(timer);
        return;
      }
      router.refresh();
    }, 5000);
    return () => clearInterval(timer);
  }, [status, router]);

  return null;
}
