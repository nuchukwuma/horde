import PlatformHeader from '@/components/platform/PlatformHeader';
import PlatformFooter from '@/components/platform/PlatformFooter';
import { LEGAL_ENTITY, LEGAL_REVIEWED } from '@/config/legal';

/** Shared frame for the Terms and the Privacy Policy. */
export default function LegalPage({ title, children }) {
  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <PlatformHeader />
      <main id="main" className="container container--narrow legal">
        <h1>{title}</h1>
        <p className="legal__updated">Last updated {LEGAL_ENTITY.lastUpdated}</p>
        {!LEGAL_REVIEWED ? (
          <div className="alert alert--warning" role="note">
            <span className="alert__icon" aria-hidden="true">!</span>
            <span>
              <strong>Draft.</strong> This text describes how HordeMart works today and is being reviewed by our lawyers. It
              may change before it is final.
            </span>
          </div>
        ) : null}
        {children}
        <hr />
        <p className="legal__contact">
          Questions about this page:{' '}
          {LEGAL_ENTITY.contactEmail ? <a href={`mailto:${LEGAL_ENTITY.contactEmail}`}>{LEGAL_ENTITY.contactEmail}</a> : 'contact HordeMart support'}
          {LEGAL_ENTITY.address ? ` · ${LEGAL_ENTITY.address}` : ''}.
        </p>
      </main>
      <PlatformFooter />
    </div>
  );
}
