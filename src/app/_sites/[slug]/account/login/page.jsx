import { notFound } from 'next/navigation';
import { ensureDatabase } from '@/lib/http/context';
import { findSiteBySlug } from '@/lib/tenant/loadSite';
import { isModuleEnabled } from '@/lib/content/modules';
import AccountForm from '@/components/shop/AccountForm';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Sign in' };

export default async function ShopLoginPage({ params }) {
  const { slug } = await params;
  await ensureDatabase();

  const site = await findSiteBySlug(slug);
  if (!site || !isModuleEnabled(site, 'store')) notFound();

  return <AccountForm mode="login" storeName={site.name} />;
}
