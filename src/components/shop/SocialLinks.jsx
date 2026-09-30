/**
 * A seller's social links on their storefront.
 *
 * Every href here was built by `buildSocialLinks` from a stored handle, so the
 * host is one we chose — the seller never supplies a URL. See
 * lib/content/socials.ts.
 *
 * `rel` carries three things, each for its own reason:
 *   noopener   — the opened page cannot reach back through window.opener
 *   noreferrer — the seller's social profile does not learn which storefront
 *                and which page the visitor came from
 *   nofollow   — a storefront must not be able to sell PageRank by listing
 *                links, which is what would happen if these were followed
 */

export default function SocialLinks({ links, heading = 'Find us' }) {
  if (!links || links.length === 0) return null;

  return (
    <section className="container" style={{ paddingBottom: 56 }}>
      <h2 className="section-title">{heading}</h2>
      <ul
        style={{
          listStyle: 'none',
          padding: 0,
          margin: 0,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        {links.map((link) => (
          <li key={link.platform}>
            <a
              className="btn"
              href={link.href}
              target="_blank"
              rel="noopener noreferrer nofollow"
              style={{ textDecoration: 'none' }}
            >
              {/* The platform name is announced too, so the handle alone is not
                  the only thing a screen reader hears. */}
              <span style={{ fontWeight: 600 }}>{link.label}</span>
              <span style={{ color: 'var(--text-secondary)', marginLeft: 8 }}>{link.text}</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
