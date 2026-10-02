# HordeMart ⇄ MrMouse — integration contract

MrMouse (inventory app) and HordeMart (store builder) are **separate products**:
separate backends, separate databases, separate subscriptions. Neither reads
the other's database. They talk in exactly three ways, all authenticated with
secrets shared only between the two servers.

This document is the half MrMouse implements. HordeMart's half is built:
`src/lib/integrations/mrmouse.ts` and `mrmouseService.ts`.

## Shared configuration

Set on **both** servers. Secrets are 32+ random characters
(`openssl rand -base64 48`), different from each other, never logged, never
sent to a browser.

| HordeMart env | MrMouse needs | Purpose |
|---|---|---|
| `MRMOUSE_WEB_URL` | — | MrMouse web app origin, e.g. `https://app.mrmouse.ng` (https) |
| `MRMOUSE_API_URL` | — | MrMouse server API origin, for sale events |
| `MRMOUSE_SSO_SECRET` | same value | signs the sign-in pass (1) |
| `MRMOUSE_WEBHOOK_SECRET` | same value | signs stock (2) and sale (3) messages |
| `MRMOUSE_ANDROID_URL`, `MRMOUSE_IOS_URL` | — | store listing links shown to sellers |
| — | `HORDEMART_API_URL` | HordeMart app host, e.g. `https://app.hordemart.com` |

Until a value is set, HordeMart shows that feature as "coming soon".

## 1. One-click sign-in (HordeMart → MrMouse web)

A seller presses **Open MrMouse** in their HordeMart dashboard. HordeMart
sends the browser to:

```
{MRMOUSE_WEB_URL}/?sso=hordemart#token=<JWT>
```

The app root, not a `/sso/hordemart` path: Mr Mouse builds with relative
asset URLs (it also ships as a desktop app over `file://`), and on a deeper
path those resolve to the wrong folder.

The pass is in the URL **fragment**: browsers never send fragments to a
server or in a Referer. MrMouse's page must:

1. Read `location.hash`, then immediately `history.replaceState` to remove it.
2. POST it at once to `POST /api/integrations/hordemart/sso { token }`.
   The backend checks it and either signs the seller in (already linked,
   current terms) → `{ status: "signed_in", token, user }`, or answers
   `{ status: "consent_required", ticket, profile }` with a 10-minute,
   single-use ticket — so the pass's 60 seconds never run out while
   someone reads the terms.
3. First time: show what linking means, require a tick, then
   `POST /api/integrations/hordemart/sso/confirm { ticket, acceptTerms: true,
   termsVersion, acceptAppTerms: true, appTermsVersion }` → signed in.

A reference implementation of all of this — frontend, Express routes,
Mongoose models and tests — is in the Mr Mouse handover package
(`src/assets/integrations/HordeMartLink.jsx`, `server/routes/hordemart.js`).

The backend verifies the pass (same rules as `verifyHandoffToken` in
`src/lib/integrations/mrmouse.ts`):

- Compact JWT, header `{"alg":"HS256","typ":"JWT"}`, signed with
  `MRMOUSE_SSO_SECRET`. **Reject any other `alg`** (including `none`).
- Constant-time signature comparison.
- `iss === "hordemart"`, `aud === "mrmouse"`, `exp` not passed (passes last 60
  seconds), `iat` not in the future (allow 30 s clock skew).
- **`jti` single use**: store it until `exp` and refuse it a second time.

Claims:

```json
{
  "iss": "hordemart", "aud": "mrmouse",
  "sub": "<HordeMart user id — stable>",
  "email": "ade@example.com", "email_verified": true,
  "name": "Ade Okon",
  "role": "owner | staff",
  "site": { "id": "<HordeMart store id>", "slug": "ade-store",
            "name": "Ade Textiles", "url": "https://ade-store.hordemart.com" },
  "iat": 1790000000, "exp": 1790000060, "jti": "<32 hex>"
}
```

Account linking rules for MrMouse:

- Link on **`sub`** (store `hordemartUserId` on the MrMouse account), not on
  email. Emails change; `sub` does not.
- First time a `sub` is seen: if a MrMouse account with that email exists,
  link it **only because `email_verified` is true** (HordeMart only issues
  passes for confirmed addresses). Otherwise create a MrMouse account.
- Remember `site.id` against the MrMouse business/workspace: it is the store
  id used in stock and sale messages.
- Then create a normal MrMouse session. **MrMouse's own subscription rules
  apply** — HordeMart grants no MrMouse plan and bills nothing for MrMouse.

## 2. Stock levels (MrMouse → HordeMart)

Only for stores whose owner switched **Stock sync** on in HordeMart.

```
POST {HORDEMART_API_URL}/api/integrations/mrmouse/inventory
Content-Type: application/json
X-MrMouse-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>

{ "siteId": "<site.id from the pass>",
  "sentAt": "2026-10-02T09:00:00Z",
  "items": [ { "sku": "ADIRE-01", "quantity": 12 } ] }
```

- Sign the **exact bytes** you send. Messages older than 5 minutes are refused.
- `quantity` is the absolute count (not a change), integer ≥ 0. Up to 500 items.
- Matched to HordeMart products **by SKU** (the seller's item code). Matching
  products get that quantity and stock tracking on. **Prices are never taken.**
- `sentAt` is your clock: a line older than the last one applied to that
  product is skipped, so retries and out-of-order delivery are safe.
- Responses: `200 { data: { updated, unknownSkus, stale } }`, `401` bad or old
  signature, `409` the store has not switched stock sync on, `404` store
  unknown, `422` malformed body, `429` slow down.

## 3. Sales (HordeMart → MrMouse)

When a HordeMart order is paid, for stores with stock sync on:

```
POST {MRMOUSE_API_URL}/integrations/hordemart/sales
Content-Type: application/json
X-HordeMart-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256(secret, "<t>.<raw body>")>

{ "event": "order.paid", "siteId": "<store id>", "orderNumber": "HM-…",
  "paidAt": "2026-10-02T09:00:00Z",
  "items": [ { "sku": "ADIRE-01", "quantity": 2 } ] }
```

- Verify the signature the same way (5-minute window, constant time).
- **Deduplicate on `orderNumber`**: it is unique per store; a message can arrive
  twice.
- Contains no customer details and no amounts — only what left the shelf.
- Answer 2xx only once the sale is recorded. Anything else (or no answer
  within 5 seconds) is retried: after 1 min, 5 min, 15 min, 1 h, 3 h, 6 h,
  12 h and 24 h, each time freshly signed. After that the store owner sees
  the sale as "didn't reach MrMouse" with a Try again button. Because of
  the retries, deduplicating on `(siteId, orderNumber)` is required.
- Until a sale is confirmed, HordeMart takes its units off any stock count
  MrMouse sends (and off counts MrMouse took before it was delivered), so a
  push cannot put sold items back on the shelf.
- Retries run after each new sale and each stock message from that store,
  and from `GET /api/cron/mrmouse-sales` (`Authorization: Bearer
  $CRON_SECRET`) or `npm run mrmouse:retry` — schedule one of those every
  few minutes.

## Security checklist for MrMouse

- [ ] Secrets only in environment variables; never logged or sent to clients.
- [ ] `alg` pinned to HS256; signature compared in constant time.
- [ ] `jti` stored and refused on reuse; `exp` enforced.
- [ ] Token removed from the address bar before anything else runs.
- [ ] Accounts linked on `sub`; email used only with `email_verified: true`.
- [ ] Sale events deduplicated on `(siteId, orderNumber)`.
- [ ] Disconnecting in HordeMart stops stock sync at HordeMart's end; MrMouse
      should stop pushing on a `409`.

## Legal (NDPA 2023) — confirm with a lawyer

Connecting shares the seller's name, email and store details with MrMouse,
and with stock sync, SKUs and quantities sold. HordeMart asks the store owner
to agree before connecting and records it in the audit log. Both privacy
policies should name the other service; if MrMouse is run by a different
company, a data-sharing agreement is needed.
