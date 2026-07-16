/**
 * One-time fix: corrects remainingMonths for Mirza's ₹95,000 EMI loan so July 15 shows as overdue.
 *
 * Problem: initial remainingMonths was 8 (should be 12). Backfill recorded 3 payments
 * (Apr/May/Jun 15) decrementing to 5. Correct value is 9 (12 - 3 payments made).
 *
 * With remainingMonths=9:
 *   paidMonths = 12 - 9 = 3
 *   nextPaymentDate = Mar 15 + (3+1) months = Jul 15, 2026  ← overdue ✓
 */
import * as emiSheet from "../src/lib/emiSheet";

const LOAN_ID = "f38020f6-cedb-446d-8e5e-510e9e537b31";
const CORRECT_REMAINING = 9;

async function main() {
  console.log("Reading current state…");
  const loan = await emiSheet.getEmiLoanRow(LOAN_ID);
  if (!loan) {
    console.error("❌ Loan not found!");
    process.exit(1);
  }
  console.log(`  Principal: ₹${loan.principal}, Monthly: ₹${loan.monthlyPayment}`);
  console.log(`  Current: remainingMonths=${loan.remainingMonths}, nextPaymentDate=${loan.nextPaymentDate}`);
  console.log(`  paidDates: ${loan.paidDates.join(" | ")}`);

  if (loan.remainingMonths === CORRECT_REMAINING) {
    console.log(`  ✅ Already at correct value (${CORRECT_REMAINING}). Nothing to do.`);
    return;
  }

  console.log(`  Updating remainingMonths: ${loan.remainingMonths} → ${CORRECT_REMAINING}…`);
  const updated = await emiSheet.updateEmiLoanRow(LOAN_ID, {
    remainingMonths: CORRECT_REMAINING,
  });

  console.log(`  ✅ Done.`);
  console.log(`  Final: remainingMonths=${updated?.remainingMonths}, nextPaymentDate=${updated?.nextPaymentDate}, status=${updated?.status}`);
  console.log("\n✅ Fix complete.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
