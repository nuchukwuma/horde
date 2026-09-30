/**
 * Detecting off-platform payment solicitation in messages.
 *
 * WHY THIS EXISTS, before the mechanics.
 *
 * Buyer-seller chat is the channel through which marketplaces lose their
 * revenue and their customers lose their protection. The message is always
 * some version of "don't pay on the website, send it to this account and I'll
 * give you a discount". Both sides have a reason to say yes: the seller keeps
 * the whole amount, the buyer saves a little.
 *
 * What the buyer does not see is what they gave up. Paying through checkout
 * means the order exists, the amount is recorded, the refund path works, and a
 * dispute has a paper trail. A bank transfer to a stranger has none of that.
 * When it goes wrong — and the fraud cases are exactly the ones that push
 * hardest for a transfer — the complaint arrives at the platform, because the
 * platform is where they found the seller. We carry the reputational and
 * regulatory cost of a transaction we never saw and earned nothing from.
 *
 * So this is not revenue protection dressed up as safety. It is both, and the
 * safety half is the part that matters when a regulator asks what we did.
 *
 * WHAT THIS IS NOT. It does not block messages. A detector that blocks on a
 * keyword is trivially defeated ("zero eight one two...") and will refuse
 * legitimate conversation — a seller answering "we don't take bank transfers,
 * please use the checkout button" trips every signal in here. Blocking would
 * teach both parties to move to WhatsApp immediately, where we see nothing at
 * all. Keeping the conversation on-platform and visible is worth more than
 * winning an argument with one message.
 *
 * Instead: the buyer sees a warning, the message is flagged, and an admin can
 * review a seller who does it repeatedly. The signal is the evidence.
 */

/** A ten-digit NUBAN. The single strongest signal in this market. */
const NUBAN = /\b\d{10}\b/;

/**
 * Digits spelled out, which is what someone does on a second attempt.
 *
 * Deliberately requires several in a row: "two" in ordinary prose is common,
 * six number-words together is somebody reading out an account.
 */
const SPELLED_DIGITS =
  /\b(?:zero|one|two|three|four|five|six|seven|eight|nine|oh|nought)\b(?:[\s,.-]+\b(?:zero|one|two|three|four|five|six|seven|eight|nine|oh|nought)\b){5,}/i;

/**
 * Digits broken up to defeat a plain \d{10}: "0801-234-5678", "0 8 0 1 …".
 *
 * Done by normalising rather than by one regex. The first attempt here
 * required a separator after every digit, which matched "0 8 0 1 2 3 4 5 6 7"
 * and missed "0801-234-5678" — the more common form by far. Stripping the
 * separators first and then looking for a run of ten catches both, and every
 * grouping in between.
 *
 * Ten, not fewer: eight digits is a date (2026-09-30 → 20260930) and would
 * flag half the conversations in a shop.
 */
const SEPARATORS = /[\s._()+-]/g;
const TEN_DIGIT_RUN = /\d{10,}/;

function hasGroupedAccountNumber(body: string): boolean {
  const stripped = body.replace(SEPARATORS, '');
  // Only interesting when the original was actually broken up — otherwise this
  // is the same finding as the plain NUBAN match and should not double-count.
  return TEN_DIGIT_RUN.test(stripped) && !TEN_DIGIT_RUN.test(body);
}

/**
 * Nigerian bank and wallet names.
 *
 * The same vocabulary as tenant/reserved.ts, for a related reason: there it
 * stops a phishing subdomain, here it spots a payment instruction. Kept as its
 * own list rather than imported because the two serve different purposes and
 * should be free to diverge — this one wants "first bank" with a space, which
 * would be meaningless as a subdomain.
 */
const BANK_WORDS = [
  'gtbank', 'gtb', 'guaranty trust', 'zenith', 'access bank', 'accessbank',
  'first bank', 'firstbank', 'uba', 'united bank for africa', 'fidelity',
  'sterling', 'stanbic', 'union bank', 'unionbank', 'wema', 'alat', 'polaris',
  'keystone', 'ecobank', 'fcmb', 'heritage', 'providus', 'jaiz', 'unity bank',
  'titan', 'globus', 'opay', 'palmpay', 'kuda', 'moniepoint', 'carbon',
  'fairmoney', 'paga', 'momo', 'vfd', 'sparkle', 'rubies',
];

/** Phrases that mean "pay me somewhere else". */
const OFF_PLATFORM_PHRASES = [
  'account number', 'acct number', 'acct no', 'account no', 'acc no',
  'bank transfer', 'transfer to', 'send the money', 'send money to',
  'pay me directly', 'pay directly', 'pay outside', 'outside the app',
  'outside the site', 'outside the platform', 'off the app', 'cash on delivery',
  'send to my account', 'my account details', 'bank details', 'account details',
  'i will send you my account', 'chat me on whatsapp', 'message me on whatsapp',
  'dm me on whatsapp', 'call me on', 'whatsapp me',
  'avoid the fee', 'avoid fees', 'no fees if', 'cheaper if you',
  'discount if you transfer', 'skip the checkout', 'without the website',
];

/** Crypto and gift cards: the other way money leaves without recourse. */
const IRREVERSIBLE_PHRASES = [
  'bitcoin', 'btc', 'usdt', 'tether', 'binance', 'crypto', 'trc20', 'erc20',
  'gift card', 'giftcard', 'steam card', 'itunes card',
];

export type RiskSignal =
  | 'account_number'
  | 'spelled_out_number'
  | 'spaced_out_number'
  | 'bank_name'
  | 'off_platform_request'
  | 'irreversible_payment';

export interface PaymentRiskResult {
  /** True when anything fired. The message is still delivered. */
  flagged: boolean;
  signals: RiskSignal[];
  /** Shown to the BUYER, not the seller. Empty when nothing fired. */
  warning: string | null;
}

/**
 * The warning text.
 *
 * Addressed to the buyer and phrased around what they lose, because "this
 * violates our terms" is the platform's problem and "you have no way to get
 * your money back" is theirs. It does not accuse the seller: the same signals
 * fire on a seller warning a buyer off a scam, and calling an innocent seller
 * a fraudster inside their own store is worse than the risk being described.
 */
const BUYER_WARNING =
  'Be careful: this message mentions paying outside this store. If you pay by ' +
  'bank transfer, cash, crypto or gift card, there is no order, no receipt and ' +
  'no way for us to help you get your money back. Paying with the checkout ' +
  'button keeps your payment traceable and refundable.';

/**
 * Pure, and deliberately cheap: it runs on every message.
 *
 * Case-insensitive across the whole body. No attempt at language detection —
 * Nigerian Pidgin and English interleave in the same sentence constantly, and
 * the signals here are numbers and brand names either way.
 */
export function assessPaymentRisk(body: string): PaymentRiskResult {
  const text = body.toLowerCase();
  const signals: RiskSignal[] = [];

  if (NUBAN.test(body)) signals.push('account_number');
  if (SPELLED_DIGITS.test(text)) signals.push('spelled_out_number');
  if (hasGroupedAccountNumber(body)) signals.push('spaced_out_number');
  if (BANK_WORDS.some((word) => text.includes(word))) signals.push('bank_name');
  if (OFF_PLATFORM_PHRASES.some((phrase) => text.includes(phrase))) {
    signals.push('off_platform_request');
  }
  if (IRREVERSIBLE_PHRASES.some((phrase) => text.includes(phrase))) {
    signals.push('irreversible_payment');
  }

  return {
    flagged: signals.length > 0,
    signals,
    warning: signals.length > 0 ? BUYER_WARNING : null,
  };
}

/**
 * How many flagged messages from one seller justify a human look.
 *
 * Not one. A single flag is usually a seller saying "we only accept card
 * payments here", and acting on it would punish the right behaviour. A pattern
 * is different, and this is a threshold for a review queue, never for an
 * automatic suspension: suspending a storefront stops a real business trading,
 * which is not a decision a regex gets to make.
 */
export const SELLER_REVIEW_THRESHOLD = 3;
