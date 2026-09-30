# Questions for Paystack before going live

Three of these block real money. They cannot be answered from documentation or
from reading our code — they are questions about what Paystack's systems
actually do, and the answers change what we must build.

Send to Paystack support, or ask during marketplace approval. Record the answers
here with the date, then act on the "if the answer is…" rows.

---

## 1. Who is debited on a refund of a split transaction? (BLOCKING)

This is the one that matters most. It is [ADR-0009](adr/0009-refund-commission-policy.md)'s
open risk, and until it is answered `issueRefund` refuses to run in production.

> We operate a marketplace on Paystack. Each transaction uses a subaccount with
> an explicit `transaction_charge` so the seller receives most of the payment
> and our platform account receives a fee. Both are settled directly by
> Paystack.
>
> When we issue a refund against such a transaction — full or partial — which
> balance is debited?
>
> a) Is the seller's subaccount debited for its share and our platform account
>    for ours, in the same proportion as the original split?
>
> b) Or is our platform account debited for the entire refund amount, leaving
>    the seller's already-settled share untouched?
>
> If (b): is there any mechanism to recover the seller's portion from their
> subaccount — an automatic claw-back, a negative subaccount balance, a
> deduction from their next settlement — or does recovering it become our
> commercial problem?
>
> And if the subaccount has already been settled to the seller's bank account
> and holds no balance, what happens then?

**Why it changes the build**

| If the answer is | Then |
|---|---|
| (a) proportional debit | Our ledger already matches reality. Set `PAYSTACK_REFUND_MECHANICS_CONFIRMED=true` and nothing else changes. |
| (b) platform debited in full, with claw-back | Still workable. We need to model the claw-back's timing, because our balance carries the refund until it lands. |
| (b) platform debited in full, no claw-back | **Serious.** Every refund creates a receivable against the seller. That is lending, and it contradicts [ADR-0007](adr/0007-never-hold-seller-funds.md). We would need either a reserve withheld from sellers (which means holding seller funds — the thing we refuse to do), or a refund policy where the seller, not us, is the refunding party. Do not launch refunds before resolving this. |

---

## 2. Marketplace approval and the `transaction_charge` model (BLOCKING)

> We are a multi-tenant platform: each seller gets a subdomain storefront, and
> customers pay on the seller's own page. We use subaccounts with a per-
> transaction `transaction_charge` and `bearer` set per plan.
>
> - Does this use of subaccounts require explicit marketplace approval on our
>   account, and what does that process involve?
> - Are there restrictions on us setting `transaction_charge` per transaction
>   rather than a fixed `percentage_charge` per subaccount?
> - Our sellers are onboarded by us, not by Paystack. What KYC are we expected
>   to perform, and what does Paystack perform? Specifically: is resolving the
>   account name via `/bank/resolve` and storing the resolved name sufficient
>   from your side, or do you require identity documents we are not currently
>   collecting?

---

## 3. Settlement timing and the new-seller hold

> - What is the settlement window for a subaccount on a Nigerian account —
>   T+1, T+2, does it vary by bank?
> - If we wanted to delay a new seller's *ability to transact* (not their
>   settlement) for a fraud-review period, is there anything on Paystack's side
>   for that, or is it entirely ours to implement?

We already implement the hold ourselves and gate transacting rather than
settlement ([ADR-0007](adr/0007-never-hold-seller-funds.md)), so this is
confirmation rather than a dependency.

---

## 4. Disputes and chargebacks on a split transaction

> When a customer disputes a split transaction:
>
> - Which balance is debited while the dispute is open?
> - If the dispute is lost, who bears it — us, the subaccount, or both in
>   proportion?
> - Is the processing fee returned on a lost dispute?

Same shape of risk as question 1. Our webhook handles `charge.dispute.create`
but the ledger consequence depends on this answer.

---

## 5. Refund of the processing fee

> On a refund, is Paystack's processing fee returned to us, or is it retained?
> We have assumed it is retained and that somebody is permanently out that fee.
> Is that correct for both full and partial refunds?

ADR-0009 is built on "retained". If that assumption is wrong, the fee engine
over-charges somebody on every refund.

---

## Answers

Record them here as they arrive. A dated answer in this file is what
`PAYSTACK_REFUND_MECHANICS_CONFIRMED=true` is asserting exists.

| # | Date | Answered by | Answer |
|---|---|---|---|
| 1 | | | |
| 2 | | | |
| 3 | | | |
| 4 | | | |
| 5 | | | |
