/**
 * Normalize a phone number for use in `tel:` and `wa.me/` links.
 *
 * Returns the digits-only E.164 form WITHOUT a leading `+`
 * (both `tel:+<digits>` and `https://wa.me/<digits>` accept this form).
 *
 * Rules:
 *   1. Strip all non-digit characters.
 *   2. If the digit string begins with a leading `0`, treat it as a local
 *      Israeli number and replace the leading `0` with the `972` country code.
 *   3. Otherwise the number is assumed to already be country-coded
 *      (e.g. `+972…` or a foreign `+1…`) and is passed through.
 *   4. Validate the result is between 9 and 15 digits inclusive (E.164 max
 *      is 15; we allow down to 9 to cover short national numbers post-strip).
 *      Anything outside that range yields `null`.
 *
 * Returns `null` for empty / whitespace-only / non-numeric input.
 */
export function normalizePhoneToE164IL(raw: string): string | null {
  if (typeof raw !== 'string') return null;
  const digits = raw.replace(/\D+/g, '');
  if (digits.length === 0) return null;

  const e164 = digits.startsWith('0') ? '972' + digits.slice(1) : digits;

  if (e164.length < 9 || e164.length > 15) return null;
  return e164;
}

/**
 * Display-friendly Israeli phone format: turn the canonical seed shape
 * `+972 50-000-0000` into `050 000 0000` (local prefix, space-separated).
 * Used across the roster, person drawer, and reservist contact card.
 */
export const fmtPhoneIL = (p: string): string =>
  p.replace('+972 ', '0').replace(/-/g, ' ');
