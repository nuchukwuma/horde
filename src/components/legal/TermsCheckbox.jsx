/**
 * The one consent box, used wherever HordeMart asks for agreement: never
 * pre-ticked, naming what is agreed to, with the documents one tap away.
 * The server checks the same thing independently (lib/legal/terms.ts).
 *
 * `termsUrl` / `privacyUrl` are absolute on a store's own address, where
 * "/terms" would be the store's page, not HordeMart's.
 */
export default function TermsCheckbox({
  id = 'accept-terms',
  checked,
  onChange,
  termsUrl = '/terms',
  privacyUrl = '/privacy',
  children = null,
}) {
  return (
    <label className="checkbox terms-check" htmlFor={id}>
      <input id={id} type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} required />
      <span>
        I have read and agree to the{' '}
        <a href={termsUrl} target="_blank" rel="noopener">
          Terms of Service
        </a>{' '}
        and the{' '}
        <a href={privacyUrl} target="_blank" rel="noopener">
          Privacy Policy
        </a>
        {children}.
      </span>
    </label>
  );
}
