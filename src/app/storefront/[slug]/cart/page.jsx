import { notFound } from 'next/navigation';
import { cookies } from 'next/headers';
import { requireStorefront } from '@/lib/tenant/storefront';
import { isModuleEnabled } from '@/lib/content/modules';
import { validateCustomerSessionToken } from '@/lib/auth/session';
import { sessionCookieName } from '@/lib/auth/cookies';
import { platformOrigin } from '@/lib/seo/meta';
import CartView from '@/components/shop/CartView';

export const metadata = { title: 'Your basket', robots: { index: false } };

export default async function CartPage({ params }) {
  const site = await requireStorefront(params);
  if (!isModuleEnabled(site, 'store')) notFound();

  const token = (await cookies()).get(sessionCookieName('storefront'))?.value;
  const session = await validateCustomerSessionToken(token, site._id);
  const shopper = session ? { email: session.customer.email, name: session.customer.name ?? '' } : null;

  return (
    <div className="container section-sm">
      <header className="page-head">
        <h1 className="page-head__title">Your basket</h1>
      </header>
      <CartView storeName={site.name} shopper={shopper} privacyUrl={`${platformOrigin()}/privacy#shoppers`} termsUrl={`${platformOrigin()}/terms`} />
    </div>
  );
}
