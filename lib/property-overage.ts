import { PROPERTY_OVERAGE_CENTS } from "@/lib/public-site";

const DAY_MS = 24 * 60 * 60 * 1000;

function utcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}

function daysInUtcMonth(year: number, monthIndex: number) {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function addMonthsUtc(value: Date, months: number) {
  const target = new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth() + months, 1));
  const dim = daysInUtcMonth(target.getUTCFullYear(), target.getUTCMonth());
  return new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), Math.min(value.getUTCDate(), dim)));
}

/**
 * Calendar months from the day a property is added until the workspace renewal date.
 * The same day of a later month counts as a whole number of months. A leftover partial
 * month counts as days remaining divided by the number of days in that month.
 */
export function monthsUntilRenewal(addedAt: Date, renewal: Date) {
  const start = utcDay(addedAt);
  const end = utcDay(renewal);
  if (end.getTime() <= start.getTime()) return 0;
  let months = 0;
  let cursor = start;
  while (true) {
    const next = addMonthsUtc(cursor, 1);
    if (next.getTime() <= end.getTime()) {
      months += 1;
      cursor = next;
      continue;
    }
    const dim = daysInUtcMonth(cursor.getUTCFullYear(), cursor.getUTCMonth());
    const days = (end.getTime() - cursor.getTime()) / DAY_MS;
    return months + days / dim;
  }
}

/** $18 a year, prorated. Eleven months is $16.50. Fourteen days in February is $0.75. */
export function proratedOverageCents(addedAt: Date, renewal: Date) {
  return Math.round(PROPERTY_OVERAGE_CENTS * monthsUntilRenewal(addedAt, renewal));
}

/** First renewal strictly after `onDate`, on the anniversary of `anchor`. */
export function nextRenewalDate(anchor: Date, onDate: Date) {
  const start = utcDay(anchor);
  const day = utcDay(onDate);
  let renewal = addMonthsUtc(start, 12);
  while (renewal.getTime() <= day.getTime()) renewal = addMonthsUtc(renewal, 12);
  return renewal;
}

/**
 * Moov standard US card fee, excluding card-network interchange.
 * 0.60% of the prorated amount, plus $0.15 on a successful charge, plus $0.15 per transaction.
 */
export const MOOV_CARD_RATE_BPS = 60;
export const MOOV_CARD_SUCCESS_CENTS = 15;
export const MOOV_CARD_ATTEMPT_CENTS = 15;

export function overageTransactionFeeCents(propertyCents: number) {
  if (propertyCents <= 0) return 0;
  return Math.round((propertyCents * MOOV_CARD_RATE_BPS) / 10_000) + MOOV_CARD_SUCCESS_CENTS + MOOV_CARD_ATTEMPT_CENTS;
}

export function formatCents(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}
