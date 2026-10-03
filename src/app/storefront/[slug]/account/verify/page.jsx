import { notFound } from 'next/navigation';
import { ensureDatabase } from '@/lib/http/context';
import { findSiteBySlug } from '@/lib/tenant/loadSite';
import { isModuleEnabled } from '@/lib/content/modules';
import ConfirmCustomerEmail from '@/components/shop/ConfirmCustomerEmail';

/** Where a shopper's confirmation link lands, on the store's own address. */

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Confirm your email', robots: { index: false } };

export default async function ShopVerifyEmailPage({ params }) {
  const { slug } = await params;
  await ensureDatabase();

  const site = await findSiteBySlug(slug);
  if (!site || !isModuleEnabled(site, 'store')) notFound();

  return <ConfirmCustomerEmail storeName={site.name} />;
}
