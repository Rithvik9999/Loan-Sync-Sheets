/**
 * One-time script: mark all "pay daily 600" and "pay daily 350" loans
 * as paid through yesterday (July 23, 2026).
 *
 * Run from workspace root:
 *   cd artifacts/api-server && npx tsx ../../scripts/mark-daily-paid.mts
 */
import { listLoanRows, updateLoanRow } from "./src/lib/heatMapSheet.js";

const TODAY_STR = "2026-07-24";
const TODAY = new Date(TODAY_STR + "T00:00:00Z");

function daysBetween(later: Date, earlier: Date): number {
  return Math.floor((later.getTime() - earlier.getTime()) / 86_400_000);
}

function parseDailyAmount(notes: string | null | undefined, whatsapp: string | null | undefined): number | null {
  const text = `${notes ?? ""} ${whatsapp ?? ""}`.toLowerCase();
  const m = text.match(/pay\s+daily\s+(\d+)/);
  return m ? Number(m[1]) : null;
}

const loans = await listLoanRows();

for (const loan of loans) {
  if (loan.status === "Clear" || loan.status === "Archived") continue;

  const dailyAmt = parseDailyAmount(loan.notes, loan.whatsapp);
  if (dailyAmt !== 600 && dailyAmt !== 350) continue;

  const txDate = loan.transactionDate ? new Date(loan.transactionDate + "T00:00:00Z") : null;
  if (!txDate) {
    console.log(`  SKIP ${loan.name}: no transactionDate`);
    continue;
  }

  const daysElapsed = Math.max(daysBetween(TODAY, txDate), 0);
  const periodsToMark = daysElapsed - 1; // yesterday and before
  if (periodsToMark <= 0) {
    console.log(`  SKIP ${loan.name} (${dailyAmt}/day): loan started today or in the future`);
    continue;
  }

  const expectedPaid = dailyAmt * periodsToMark;
  const currentPaid = loan.paid ?? 0;

  if (currentPaid >= expectedPaid) {
    console.log(`  OK   ${loan.name} (${dailyAmt}/day): already at ${currentPaid} (need ${expectedPaid})`);
    continue;
  }

  console.log(`  UPD  ${loan.name} (${dailyAmt}/day): ${currentPaid} → ${expectedPaid}  [${periodsToMark} days × ₹${dailyAmt}]`);
  await updateLoanRow(loan.id, { paid: expectedPaid });
}

console.log("\nDone.");
