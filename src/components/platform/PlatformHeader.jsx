import BrandMark from '@/components/art/BrandMark';
import ColorSchemeSwitch from './ColorSchemeSwitch';

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
          <ColorSchemeSwitch />
          <a href="/login" aria-current={current === 'login' ? 'page' : undefined}>
            Sign in
          </a>
          {cta ? (
            <a className="btn btn--primary btn--sm" href="/signup" aria-label="Open your shop">
              {/* "Open shop" on the narrowest phones, where the header is full. */}
              <span className="cta-long">Open your shop</span>
              <span className="cta-short" aria-hidden="true">
                Open shop
              </span>
            </a>
          ) : null}
        </nav>
      </div>
    </header>
  );
}
