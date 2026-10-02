/**
 * ⚠️  The Terms and Privacy Policy are DRAFTS written from how the product
 * works. They have not been reviewed by a Nigerian lawyer.
 *
 * While this is false, both pages carry a visible "draft" notice. Set it to
 * true — and fill in the details below — only after a lawyer has approved the
 * text (NDPA 2023, CBN posture, consumer protection under the FCCPA).
 */
export const LEGAL_REVIEWED = false;

/** Shown on both pages. Fill in before launch. */
export const LEGAL_ENTITY = {
  name: 'HordeMart', // TODO: registered company name and RC number
  address: null, // TODO: registered office address in Nigeria
  contactEmail: process.env.SALES_CONTACT_EMAIL ?? null, // TODO: a privacy@ address
  lastUpdated: '1 October 2026',
};
