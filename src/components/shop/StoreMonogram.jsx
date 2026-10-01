/**
 * A store's initials in its brand colour — the logo every new shop has
 * before it has a logo.
 */
export default function StoreMonogram({ name, className = 'monogram' }) {
  const initials =
    String(name ?? '')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((word) => word[0])
      .join('')
      .toUpperCase() || 'S';

  return (
    <span className={className} aria-hidden="true">
      {initials}
    </span>
  );
}
