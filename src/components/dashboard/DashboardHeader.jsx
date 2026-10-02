import SignOutButton from '@/components/auth/SignOutButton';

/**
 * One header for every dashboard page. The pages used to have three
 * different ones — a full menu, two links, or only "← Back to dashboard" —
 * and none could sign out.
 *
 * On a phone the menu takes a row of its own and wraps (.dash-nav), so every
 * link stays visible without widening the page.
 */

// [key, path, label, shown when] — `modules` is the site's on/off switches.
const LINKS = [
  ['overview', '', 'Overview'],
  ['products', '/products', 'Products', (m) => m.store],
  ['orders', '/orders', 'Orders', (m) => m.store],
  ['messages', '/messages', 'Messages', (m) => m.store],
  ['content', '/content', 'Blog & work', (m) => m.blog || m.portfolio],
  ['design', '/design', 'Design'],
  ['payouts', '/payouts', 'Payouts', (m) => m.store],
  ['address', '/address', 'Address'],
  ['billing', '/billing', 'Plan'],
];

export default function DashboardHeader({ siteId, current, storeUrl, modules = null }) {
  // Without the site's modules every link shows; a page that has them hides
  // the ones that would lead to a switched-off part of the site.
  const shown = LINKS.filter(([, , , when]) => !when || !modules || when(modules));
  return (
    <header className="masthead dash-head">
      <div className="container masthead__inner dash-head__inner">
        <a className="brand" href={`/dashboard/${siteId}`}>
          HordeMart
        </a>
        <nav className="nav dash-nav" aria-label="Dashboard">
          {shown.map(([key, path, label]) => (
            <a key={key} href={`/dashboard/${siteId}${path}`} aria-current={current === key ? 'page' : undefined}>
              {label}
            </a>
          ))}
          {storeUrl ? (
            <a href={storeUrl} target="_blank" rel="noopener noreferrer">
              View store ↗
            </a>
          ) : null}
        </nav>
        <SignOutButton endpoint="/api/auth/logout" redirectTo="/login" />
      </div>
    </header>
  );
}
