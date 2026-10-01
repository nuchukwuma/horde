import SignOutButton from '@/components/auth/SignOutButton';

/**
 * One header for every dashboard page. The pages used to have three
 * different ones — a full menu, two links, or only "← Back to dashboard" —
 * and none could sign out.
 *
 * On a phone the menu takes a row of its own and wraps (.dash-nav), so every
 * link stays visible without widening the page.
 */

const LINKS = [
  ['overview', '', 'Overview'],
  ['design', '/design', 'Design'],
  ['messages', '/messages', 'Messages'],
  ['address', '/address', 'Address'],
  ['billing', '/billing', 'Plan'],
];

export default function DashboardHeader({ siteId, current, storeUrl }) {
  return (
    <header className="masthead dash-head">
      <div className="container masthead__inner dash-head__inner">
        <a className="brand" href={`/dashboard/${siteId}`}>
          HordeMart
        </a>
        <nav className="nav dash-nav" aria-label="Dashboard">
          {LINKS.map(([key, path, label]) => (
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
