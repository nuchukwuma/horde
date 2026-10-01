import StoreMonogram from './StoreMonogram';

/**
 * The store's name in its header: the seller's logo if they uploaded one,
 * otherwise their initials in a badge.
 *
 * Shared by the storefront layout and the editor preview, so what a seller
 * sees while designing is what customers get.
 *
 * `mode` is the colour mode actually showing ('light' | 'dark' | 'auto'):
 *   light  the main logo
 *   dark   the dark-mode logo if there is one, else the main logo
 *   auto   a <picture> that lets the browser pick by the visitor's phone
 *          setting, so only the logo that is shown gets downloaded
 *
 * `href` defaults to the store's home; the editor preview passes null, which
 * renders a non-link.
 *
 * The logo image is decorative (alt=""): the store's name is always in the
 * link text — visible, or visually hidden when the seller's logo already
 * spells it out — so screen readers announce it exactly once.
 */
export default function StoreBrand({ name, theme, mode = theme?.mode ?? 'light', href = '/' }) {
  const logo = theme?.logo ?? null;
  const logoDark = theme?.logoDark ?? null;
  const size = theme?.logoSize ?? 'md';
  const showName = !logo || theme?.showName !== false;

  let mark;
  if (!logo) {
    mark = <StoreMonogram name={name} />;
  } else if (mode === 'auto' && logoDark) {
    mark = (
      <picture className="store-brand__picture">
        <source srcSet={logoDark.url} media="(prefers-color-scheme: dark)" />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="store-brand__logo" src={logo.url} alt="" width={logo.width} height={logo.height} />
      </picture>
    );
  } else {
    const shown = mode === 'dark' && logoDark ? logoDark : logo;
    // eslint-disable-next-line @next/next/no-img-element
    mark = <img className="store-brand__logo" src={shown.url} alt="" width={shown.width} height={shown.height} />;
  }

  return (
    <a className={`store-brand store-brand--logo-${size}`} href={href}>
      {mark}
      <span className={showName ? 'store-brand__name' : 'visually-hidden'}>{name}</span>
    </a>
  );
}
