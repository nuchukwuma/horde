import { headers } from 'next/headers';
import { platformOrigin } from '@/lib/seo/meta';
import { TENANT_HOST_HEADER } from '@/lib/tenant/headers';

/**
 * The platform's 404.
 *
 * On a store's address this only renders when the store itself does not exist
 * (or is suspended): a missing page inside a real store gets the store's own
 * not-found.jsx. Linking to "/" there would loop back to this page, so the
 * way out is HordeMart's home instead.
 */

export const metadata = { title: 'Page not found', robots: { index: false } };

export default async function NotFound() {
  const hostKind = (await headers()).get(TENANT_HOST_HEADER);
  const isStoreHost = hostKind === 'tenant' || hostKind === 'custom-domain';

  return (
    <main className="shell not-found">
      <div className="container container--narrow not-found__inner">
        <p className="not-found__code">404</p>
        <h1>{isStoreHost ? 'There’s no store at this address' : 'We couldn’t find that page'}</h1>
        <p className="not-found__text">
          {isStoreHost
            ? 'Check the spelling of the link. If you followed it from somewhere, the store may have changed its name or closed.'
            : 'The link may be mistyped, or the page may have moved or been taken down.'}
        </p>
        <a className="btn btn--primary" href={isStoreHost ? platformOrigin() : '/'}>
          {isStoreHost ? 'Go to HordeMart' : 'Go to the home page'}
        </a>
      </div>
    </main>
  );
}
