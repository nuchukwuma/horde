# ADR-0010: Setup-tip emails ship switched off, with one-click unsubscribe

**Date**: 2026-10-03
**Status**: accepted (feature built; sending pending legal review)
**Deciders**: repository owner, Claude
**Legal review**: required before `REENGAGEMENT_EMAILS=on` — NDPA 2023, direct marketing

## Context

Sellers who sign up and stall (no products, no bank account) rarely come back
on their own. A short email pointing at the next step is the obvious fix.

Unlike a password reset or an order receipt, such an email is not a reply to
something the seller just did. Under the Nigeria Data Protection Act 2023 it
may count as direct marketing, which needs a lawful basis (consent or a
legitimate-interest assessment) and an easy, free way to object. We are not
qualified to decide which basis applies or whether the signup terms cover it.

## Decision

1. **Built, tested, off.** `lib/email/nudges.ts` sends nothing unless
   `REENGAGEMENT_EMAILS` is exactly `on`. The default in `.env.example` is
   `off`.
2. **Every tip can be stopped in one click**: a footer link to `/unsubscribe`
   (a page with one button, so link scanners cannot unsubscribe people), and a
   `List-Unsubscribe` / `List-Unsubscribe-Post` header for mail clients'
   one-click button (RFC 8058). Links are HMAC-signed with
   `EMAIL_LINK_SECRET`, need no sign-in, and never expire. No secret, no tips.
3. **A dashboard switch** under "Get ready to sell" turns tips off and on.
4. **Restraint is in code, not in the scheduler**: each tip once per store;
   at most one tip per seller every 3 days; only stores 3–30 days old;
   nothing to suspended sellers or stores.
5. **The verification reminder is separate.** One reminder, a day after
   signup, for an unconfirmed address. It completes a signup the person
   started, so we treat it as transactional: no unsubscribe link, not gated by
   `REENGAGEMENT_EMAILS`. The lawyer should confirm this classification too.

Shopper emails (receipts, shopper address confirmation) are sent in the
store's name ("Ade Fabrics via HordeMart") and are transactional. No marketing
email is ever sent to a store's shoppers by HordeMart.

## For the lawyer

- Is a setup tip direct marketing under NDPA 2023, and does the right to object to direct marketing apply?
- If so, is legitimate interest a sound basis for an existing account holder,
  or do we need an opt-in at signup?
- Is one verification reminder transactional?
- Does the Privacy notice need a line about these emails?

## Consequences

- Turning tips on is a one-line config change once advice is in.
- If an opt-in is required instead, the switch's default flips
  (`nudgeOptOutAt` → an opt-in timestamp); the sending rules stay.
