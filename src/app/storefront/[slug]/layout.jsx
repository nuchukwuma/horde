import { cookies } from 'next/headers';
import { requireStorefront } from '@/lib/tenant/storefront';
import { platformOrigin, siteOrigin } from '@/lib/seo/meta';
import { validateCustomerSessionToken } from '@/lib/auth/session';
import { sessionCookieName } from '@/lib/auth/cookies';
import CartButton from '@/components/shop/CartButton';
import StoreBrand from '@/components/shop/StoreBrand';
import BrandMark from '@/components/art/BrandMark';
import SocialIcon from '@/components/shop/SocialIcon';
import { buildSocialLinks } from '@/lib/content/socials';
import { getPublishedDesign } from '@/lib/design/published';
import { logoIconUrl, themeAttributes, themeToCssVars } from '@/lib/design/theme';
import { cloudinaryConfig } from '@/lib/products/images';

/**
 * Storefront shell.
 *
 * Per-site theming works by overriding the accent tokens on a wrapper element,
 * so a seller's brand colour flows through buttons, links and focus rings
 * without any component knowing a theme exists. Everything the seller cannot
 * set — surfaces, ink, the data-viz series — stays on the validated defaults.
 */

export async function generateMetadata({ params }) {
  const site = await requireStorefront(params);
  // The seller's logo becomes the store's browser-tab icon once published.
  const design = await getPublishedDesign(String(site._id), site.slug);
  const icon = logoIconUrl(design?.theme.logo, cloudinaryConfig()?.cloudName);

  return {
    ...(icon ? { icons: { icon: [{ url: icon }], apple: [{ url: icon }] } } : {}),
    title: { default: site.name, template: `%s | ${site.name}` },
    description:
      typeof site.settings?.tagline === 'string' && site.settings.tagline
        ? site.settings.tagline
        : `Shop ${site.name} online. Pay securely by card, transfer or USSD.`,
    metadataBase: new URL(siteOrigin(site)),
  };
}

/** Only tokens a seller may set. Anything else is ignored rather than trusted. */
function themeStyle(theme) {
  const style = {};
  if (typeof theme?.accent === 'string' && /^#[0-9a-f]{6}$/i.test(theme.accent)) {
    style['--accent'] = theme.accent;
  }
  if (typeof theme?.accentInk === 'string' && /^#[0-9a-f]{6}$/i.test(theme.accentInk)) {
    style['--accent-ink'] = theme.accentInk;
  }
  return style;
}

export default async function StorefrontLayout({ children, params }) {
  const site = await requireStorefront(params);
  const modules = site.modules;

  // A published design wins over the older single-colour setting. Only the
  // PUBLISHED version is ever read here; drafts stay in the editor.
  const design = await getPublishedDesign(String(site._id), site.slug);
  const style = design ? themeToCssVars(design.theme) : themeStyle(site.settings?.theme ?? site.theme);

  // Built from stored handles on hosts we chose (lib/content/socials.ts).
  const socialLinks = buildSocialLinks(site.socials);

  const token = (await cookies()).get(sessionCookieName('storefront'))?.value;
  const shopper = modules.store ? await validateCustomerSessionToken(token, site._id) : null;

  return (
    <div
      className={`shell storefront${design ? ' storefront--themed' : ''}`}
      style={style}
      // data-look / data-mode select the art direction and light/dark palette
      // in storefront.css; stores without a published design keep the
      // platform defaults.
      {...(design ? themeAttributes(design.theme) : { 'data-buttons': 'solid' })}
    >
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <header className="masthead store-head">
        <div className="container masthead__inner">
          <StoreBrand name={site.name} theme={design?.theme ?? null} />

          <nav className="nav store-nav" aria-label="Primary">
            {modules.store ? <a href="/shop">Shop</a> : null}
            {modules.portfolio ? <a href="/work">Work</a> : null}
            {modules.blog ? <a href="/blog">Journal</a> : null}
            {modules.store ? (
              <a className="store-nav__account" href={shopper ? '/account/messages' : '/account/login'}>
                {shopper ? 'Messages' : 'Sign in'}
              </a>
            ) : null}
          </nav>

          {modules.store ? <CartButton /> : null}
        </div>
      </header>

      <main id="main">{children}</main>

      <footer className="footer store-footer">
        <div className="container store-footer__inner">
          <div>
            <p className="store-footer__name">{site.name}</p>
            <p className="muted" style={{ margin: '4px 0 0' }}>
              © {new Date().getFullYear()} · Payments secured by Paystack
            </p>
            {socialLinks.length > 0 ? (
              <ul className="store-footer__socials" aria-label={`${site.name} on social media`}>
                {socialLinks.map((link) => (
                  <li key={link.platform}>
                    <a
                      className="store-footer__social"
                      href={link.href}
                      target="_blank"
                      rel="noopener noreferrer nofollow"
                      aria-label={`${link.label}: ${link.text}`}
                    >
                      <SocialIcon platform={link.platform} />
                    </a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <a className="store-footer__powered" href={platformOrigin()} rel="noopener">
            <BrandMark className="store-footer__mark" />
            Made with HordeMart
          </a>
        </div>
      </footer>
    </div>
  );
}
