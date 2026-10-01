/**
 * Small, single-colour marks for the social platforms a store can link to.
 *
 * Simple drawn shapes in the text colour rather than copies of each
 * company's logo artwork: they read as "Instagram", "YouTube" and so on at
 * 20px, take the store's own colours in light and dark mode, and carry no
 * trademark artwork. Decorative — the link around them always carries the
 * platform's name for screen readers.
 */

const STROKE = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };

const GLYPHS = {
  instagram: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" {...STROKE} />
      <circle cx="12" cy="12" r="4" {...STROKE} />
      <circle cx="17.3" cy="6.7" r="1.2" fill="currentColor" />
    </>
  ),
  x: <path d="M5 4.5 19 19.5M19 4.5 5 19.5" {...STROKE} strokeWidth="2.4" />,
  facebook: (
    <path d="M14.5 21v-7.5h2.6l.4-3h-3V8.6c0-.9.3-1.5 1.6-1.5h1.6V4.4a21 21 0 0 0-2.4-.1c-2.4 0-4 1.4-4 4.1v2.1H8.6v3h2.7V21" {...STROKE} />
  ),
  tiktok: (
    <>
      <path d="M13 4v11.5a3.5 3.5 0 1 1-3.5-3.5" {...STROKE} />
      <path d="M13 4c.4 2.6 2.2 4.3 5 4.5" {...STROKE} />
    </>
  ),
  whatsapp: (
    <>
      <path d="M4.5 20 5.7 16A8.5 8.5 0 1 1 9 19.2Z" {...STROKE} />
      <path d="M9.2 8.6c.2-.5.5-.6.9-.6l.6 1.4-.6.9c.5 1.2 1.4 2.1 2.6 2.6l.9-.6 1.4.6c0 .4-.1.7-.6.9-1.8.8-5.8-3.2-5.2-5.2Z" fill="currentColor" />
    </>
  ),
  youtube: (
    <>
      <rect x="2.5" y="5.5" width="19" height="13" rx="4" {...STROKE} />
      <path d="M10 9.2v5.6l4.8-2.8Z" fill="currentColor" />
    </>
  ),
  linkedin: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" {...STROKE} />
      <path d="M8 10.5V16M8 7.6v.1M11.5 16v-5.5M11.5 13c0-1.6 1-2.6 2.3-2.6s2.2.9 2.2 2.6V16" {...STROKE} />
    </>
  ),
  website: (
    <>
      <circle cx="12" cy="12" r="8.5" {...STROKE} />
      <path d="M3.5 12h17M12 3.5c2.3 2.3 3.4 5.2 3.4 8.5s-1.1 6.2-3.4 8.5c-2.3-2.3-3.4-5.2-3.4-8.5S9.7 5.8 12 3.5Z" {...STROKE} />
    </>
  ),
};

export default function SocialIcon({ platform, size = 20, className = '' }) {
  const glyph = GLYPHS[platform] ?? GLYPHS.website;
  return (
    <svg className={`social-icon ${className}`} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {glyph}
    </svg>
  );
}
