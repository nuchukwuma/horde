/**
 * The HordeMart mark: a market stall seen head-on — striped awning, open
 * counter. It is the product in one glyph, and it reads at 16px.
 */
export default function BrandMark({ className = 'brand__mark', title }) {
  return (
    <svg
      className={className}
      viewBox="0 0 40 40"
      role={title ? 'img' : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <rect x="1.5" y="1.5" width="37" height="37" rx="10" fill="var(--accent)" />
      <path d="M7 13h26v4.5a3.25 3.25 0 0 1-6.5 0 3.25 3.25 0 0 1-6.5 0 3.25 3.25 0 0 1-6.5 0 3.25 3.25 0 0 1-6.5 0Z" fill="#fffaf2" />
      <path d="M13.5 13h6.5v4.5a3.25 3.25 0 0 1-6.5 0ZM26.5 13H33v4.5a3.25 3.25 0 0 1-6.5 0Z" fill="#f4b93e" />
      <rect x="10" y="22" width="20" height="10" rx="2" fill="#fffaf2" opacity="0.92" />
      <rect x="14" y="25" width="5" height="7" rx="1" fill="var(--accent)" />
      <rect x="22" y="25" width="5" height="4" rx="1" fill="#e8772e" />
    </svg>
  );
}
