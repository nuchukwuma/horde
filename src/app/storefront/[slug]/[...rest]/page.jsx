import { notFound } from 'next/navigation';

/**
 * Any store path no route matches. Without this, Next renders the root 404
 * outside the store's layout, so a mistyped link on a seller's site showed a
 * bare HordeMart page with no store header. Calling notFound() here renders
 * the store's own not-found.jsx inside its layout instead.
 */
export default function UnknownStorePath() {
  notFound();
}
