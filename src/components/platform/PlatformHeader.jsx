import BrandMark from '@/components/art/BrandMark';

/**
 * Header for HordeMart's own pages (landing, docs, sign in, sign up).
 * Storefronts and the dashboard have their own chrome.
 */
export default function PlatformHeader({ current, cta = true }) {
  return (
    <header className="masthead">
      <div className="container masthead__inner">
        <a className="brand" href="/">
          <BrandMark />
          HordeMart
        </a>
        <nav className="nav nav--collapsible" aria-label="Main">
          <a
            className="nav__secondary"
            href="/docs"
            aria-current={current === 'docs' ? 'page' : undefined}
          >
            How it works
          </a>
          <a href="/login" aria-current={current === 'login' ? 'page' : undefined}>
            Sign in
          </a>
          {cta ? (
            <a className="btn btn--primary btn--sm" href="/signup">
              Open your shop
            </a>
          ) : null}
        </nav>
      </div>
    </header>
  );
}
