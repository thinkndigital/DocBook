/**
 * Single money formatter.
 *
 * ## A known discrepancy, recorded rather than quietly patched
 *
 * Every `*Minor` column in this codebase is written and read as **1/100 of the major
 * unit** — the seed authors a 20 JOD consultation as `2000`, and every display site
 * divides by 100. That is self-consistent and the amounts users see are correct.
 *
 * It does not, however, match ISO 4217 for the platform's launch currency: JOD has **three**
 * decimal places (1 dinar = 1000 fils), as do KWD, BHD, and OMR — four of the exact markets
 * this platform targets. DATABASE.md's "minor currency units (fils/halalas)" describes the
 * intent; the data describes cents.
 *
 * Fixing it properly means a per-currency exponent (it belongs on the `Country` row with
 * the rest of the country config, not in a constant here) plus a data migration that
 * rescales every existing `*Minor` value — and getting that wrong silently multiplies or
 * divides real prices by ten. That is a deliberate, reviewed change, not a side effect of
 * the AI phase, so this helper matches what the data actually is today and the mismatch is
 * logged in ROADMAP.md for Phase 11.
 *
 * Using this helper everywhere new means that migration edits one function rather than
 * hunting sixteen `/ 100` call sites.
 */

export const MINOR_UNITS_PER_MAJOR = 100;

export function formatMinor(amountMinor: number, currency: string): string {
  return `${(amountMinor / MINOR_UNITS_PER_MAJOR).toFixed(2)} ${currency}`;
}
