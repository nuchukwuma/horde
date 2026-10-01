import AdirePattern from './AdirePattern';

/**
 * The picture a block shows when the seller has not uploaded one, drawn in
 * the store's look:
 *
 *   adire    a strip of resist-dyed cloth patterned from the store's name
 *   danfo    bus stripes with the name hand-lettered on a destination plate
 *   receipt  a POS receipt printed for the store, payment approved
 *
 * Pure markup and CSS (storefront.css, .look-art*): no hooks, no SVG ids, so
 * it renders identically on the server and in the editor preview, any number
 * of times on one page. Decorative only — screen readers skip it.
 */

const RECEIPT_ROWS = [
  ['MERCHANT', null],
  ['CHANNEL', 'CARD / TRANSFER / USSD'],
  ['STATUS', 'APPROVED'],
];

export default function LookArt({ look = 'adire', name, size = 'lg', className = '' }) {
  if (look === 'danfo') {
    return (
      <div className={`look-art look-art--danfo look-art--${size} ${className}`} aria-hidden="true">
        <span className="look-art__plate">{name}</span>
      </div>
    );
  }

  if (look === 'receipt') {
    return (
      <div className={`look-art look-art--receipt look-art--${size} ${className}`} aria-hidden="true">
        <div className="look-art__slip">
          <p className="look-art__slip-head">*** PAYMENT RECEIPT ***</p>
          {RECEIPT_ROWS.map(([label, value]) => (
            <p key={label} className="look-art__slip-row">
              <span>{label}</span>
              <span>{value ?? name}</span>
            </p>
          ))}
          <p className="look-art__slip-foot">THANK YOU FOR YOUR PATRONAGE</p>
        </div>
      </div>
    );
  }

  const grid = size === 'sm' ? { columns: 3, count: 6 } : size === 'md' ? { columns: 4, count: 12 } : { columns: 10, count: 30 };
  return (
    <AdirePattern
      name={name}
      columns={grid.columns}
      count={grid.count}
      ink="var(--accent)"
      resist="var(--accent-ink)"
      className={className}
    />
  );
}
