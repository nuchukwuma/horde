/**
 * A store's 404, rendered inside the store's own header, footer and colours
 * so a shopper who followed a stale link is still clearly in the same shop.
 */

export const metadata = { title: 'Page not found', robots: { index: false } };

export default function StoreNotFound() {
  return (
    <div className="container container--narrow not-found__inner">
      <p className="not-found__code">404</p>
      <h1>We couldn’t find that page</h1>
      <p className="not-found__text">
        It may have sold out, moved, or been taken down. Everything else is still here.
      </p>
      <a className="btn btn--primary" href="/">
        Back to the store
      </a>
    </div>
  );
}
