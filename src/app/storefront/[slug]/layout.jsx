import { notFound } from 'next/navigation';
import { findSiteBySlug } from '@/lib/tenant/loadSite';
import { ensureDatabase } from '@/lib/http/context';
import { siteOrigin } from '@/lib/seo/meta';

/**
 * Storefront shell.
 *
 * Per-site theming works by overriding the accent tokens on a wrapper element,
 * so a seller's brand colour flows through buttons, links and focus rings
 * without any component knowing a theme exists. Everything the seller cannot
 * set — surfaces, ink, the data-viz series — stays on the validated defaults.
 */

export async function generateMetadata({ params }) {
  const { slug } = await params;
  await ensureDatabase();
  const site = await findSiteBySlug(slug);
  if (!site) return {};

  return {
    title: { default: site.name, template: `%s | ${site.name}` },
    metadataBase: new URL(siteOrigin(site)),
  };
}

/** Only tokens a seller may set. Anything else is ignored rather than trusted. */
function themeStyle(theme) {
  const style = {};
  if (typeof theme?.accent === 'string' && /^#[0-9a-f]{6}$/i.test(theme.accent)) {
    style['--accent'] = theme.accent;
    style['--accent-hover'] = theme.accent;
  }
  if (typeof theme?.accentInk === 'string' && /^#[0-9a-f]{6}$/i.test(theme.accentInk)) {
    style['--accent-ink'] = theme.accentInk;
  }
  return style;
}

export default async function StorefrontLayout({ children, params }) {
  const { slug } = await params;
  await ensureDatabase();

  const site = await findSiteBySlug(slug);
  if (!site || site.status !== 'active') notFound();

  const modules = site.modules;

  return (
    <div className="shell" style={themeStyle(site.settings?.theme ?? site.theme)}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <header className="masthead">
        <div className="container masthead__inner">
          <a className="brand" href="/">
            {site.name}
          </a>
          <nav className="nav" aria-label="Primary">
            {modules.store ? <a href="/shop">Shop</a> : null}
            {modules.portfolio ? <a href="/work">Work</a> : null}
            {modules.blog ? <a href="/blog">Journal</a> : null}
          </nav>
        </div>
      </header>

      <main id="main">{children}</main>

      <footer className="footer">
        <div className="container row row--between" style={{ flexWrap: 'wrap', gap: 8 }}>
          <span>
            © {new Date().getFullYear()} {site.name}
          </span>
          <span>Powered by HordeMart</span>
        </div>
      </footer>
    </div>
  );
}
