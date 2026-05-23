/**
 * constants.ts — shared dimensional constants.
 *
 * Centralizes the millisecond literals (`86_400_000`, `3600_000`,
 * `24 * 60 * 60 * 1000`) that were sprinkled across components in
 * three inconsistent forms. Using named constants reads better at
 * the call site and removes the off-by-underscore foot-gun where one
 * literal differs from another by accident.
 */

export const MS_PER_HOUR = 3_600_000;
export const MS_PER_DAY = 86_400_000;
