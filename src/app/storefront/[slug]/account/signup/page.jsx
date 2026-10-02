import { notFound } from 'next/navigation';
import { ensureDatabase } from '@/lib/http/context';
import { findSiteBySlug } from '@/lib/tenant/loadSite';
import { isModuleEnabled } from '@/lib/content/modules';
import { platformOrigin } from '@/lib/seo/meta';
import AccountForm from '@/components/shop/AccountForm';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Create an account' };

export default async function ShopSignupPage({ params }) {
  const { slug } = await params;
  await ensureDatabase();

  const site = await findSiteBySlug(slug);
  // Accounts exist to make buying easier, so they follow the store module. A
  // portfolio-only site has nothing for a shopper to have an account for.
  if (!site || !isModuleEnabled(site, 'store')) notFound();

  // Absolute: on a store's own address "/terms" would be the store's page.
  return (
    <AccountForm
      mode="signup"
      storeName={site.name}
      termsUrl={`${platformOrigin()}/terms`}
      privacyUrl={`${platformOrigin()}/privacy#shoppers`}
    />
  );
}
