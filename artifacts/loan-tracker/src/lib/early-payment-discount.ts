/**
 * Early-payment (prepayment) discount estimate for regular Loans.
 *
 * The lender's Google Sheet ("Heat Map" tab) is the authoritative source for
 * every rupee owed — its array formulas compute flat fee, interest, late
 * fees and final amount from the loan's *agreed* tenure (`tenureDays`), not
 * from when the borrower actually repays. That means paying off a loan
 * early does not, by itself, reduce the interest already computed by the
 * sheet: someone has to manually enter a discount in the sheet's
 * "Discount/Charges" column.
 *
 * This module estimates a fair discount for early repayment by re-running
 * the *same* tiered flat-fee / interest formulas the sheet uses, but with
 * the tenure replaced by how many days the loan was actually held (plus a
 * 3-day grace/processing buffer), and comparing that to what the sheet
 * already charged for the full agreed tenure.
 *
 * IMPORTANT: this is an estimate shown to the borrower as an incentive to
 * pay early. It does not write anything back to the sheet — admin still
 * enters the final Discount/Charges value there after verifying the
 * payment, exactly like every other manual figure in the ledger.
 */

/** Tenure-tier bump on top of the flat 10% base interest rate. */
function tenureInterestTierRate(days: number): number {
  if (days <= 3) return 0.04;
  if (days <= 9) return 0.03;
  if (days <= 29) return 0.02;
  if (days <= 89) return 0.01;
  return 0;
}

/** Principal-tier bump on top of the flat 10% base interest rate. */
function principalInterestTierRate(amount: number): number {
  if (amount < 1000) return 0.04;
  if (amount <= 4999) return 0.03;
  if (amount <= 9999) return 0.02;
  if (amount <= 29999) return 0.01;
  return 0;
}

/** Tenure-tier flat fee rate (percentage of principal). */
function flatFeeTierRate(days: number): number {
  if (days <= 3) return 0.05;
  if (days <= 9) return 0.04;
  if (days <= 29) return 0.03;
  if (days <= 89) return 0.02;
  return 0.01;
}

export interface EarlyPaymentDiscountInput {
  principal: number;
  tenureDays: number;
  transactionDate: string; // YYYY-MM-DD, the "loan availing date"
  partPayment?: number | null;
  /** Sheet-computed flat fee for the full agreed tenure, if known. */
  flatFee?: number | null;
  /** Sheet-computed interest for the full agreed tenure, if known. */
  interest?: number | null;
  /** Date the borrower intends to pay (defaults to now). */
  paymentDate?: Date;
}

export interface EarlyPaymentDiscountResult {
  /** Days actually held: loan availing date → payment date. */
  elapsedDays: number;
  /** elapsedDays + 3 day grace/processing buffer — what we charge for. */
  chargeDays: number;
  /** Estimated discount (>= 0). Zero if paying at/after the agreed tenure. */
  discount: number;
}

function daysBetween(fromISO: string, to: Date): number {
  const from = new Date(fromISO);
  const ms = to.getTime() - from.getTime();
  return Math.max(0, Math.ceil(ms / 86400000));
}

/**
 * Estimates the early-payment discount, mirroring the Heat Map sheet's
 * flat-fee and interest formulas. Returns discount = 0 when the borrower
 * isn't actually paying early (chargeDays >= tenureDays).
 */
export function computeEarlyPaymentDiscount(
  input: EarlyPaymentDiscountInput,
): EarlyPaymentDiscountResult {
  const {
    principal,
    tenureDays,
    transactionDate,
    partPayment,
    flatFee,
    interest,
    paymentDate = new Date(),
  } = input;

  const elapsedDays = daysBetween(transactionDate, paymentDate);
  const chargeDays = elapsedDays + 3;

  if (!tenureDays || chargeDays >= tenureDays) {
    return { elapsedDays, chargeDays, discount: 0 };
  }

  const principalForInterest = Math.max(principal - (partPayment ?? 0), 0);

  const originalInterest =
    interest ??
    principalForInterest *
      (0.1 +
        tenureInterestTierRate(tenureDays) +
        principalInterestTierRate(principalForInterest)) /
      30 *
      tenureDays;

  const originalFlatFee = flatFee ?? principal * flatFeeTierRate(tenureDays);

  const adjustedInterest =
    (principalForInterest *
      (0.1 +
        tenureInterestTierRate(chargeDays) +
        principalInterestTierRate(principalForInterest))) /
    30 *
    chargeDays;

  const adjustedFlatFee = principal * flatFeeTierRate(chargeDays);

  const discount = Math.max(
    0,
    Math.round(
      originalFlatFee + originalInterest - adjustedFlatFee - adjustedInterest,
    ),
  );

  return { elapsedDays, chargeDays, discount };
}
