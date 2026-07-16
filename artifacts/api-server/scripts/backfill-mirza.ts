/**
 * One-time backfill script: finds Mirza's EMI loans and records all monthly
 * payments up to July 14, 2026 so that July 15 shows as overdue.
 *
 * Run with:  npx tsx scripts/backfill-mirza.ts
 */
import * as emiSheet from "../src/lib/emiSheet";

const CUTOFF = "2026-07-14"; // Record payments UP TO AND INCLUDING this date

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

async function main() {
  console.log("Loading EMI loans…");
  const rows = await emiSheet.listEmiLoanRows();

  // Find Mirza's loans
  const mirzaLoans = rows.filter((r) =>
    (r.name ?? "").toLowerCase().includes("mirza"),
  );

  if (mirzaLoans.length === 0) {
    console.log("❌ No loans found for Mirza. Checking all names:");
    rows.forEach((r) => console.log("  ", r.id, r.name, r.principal));
    return;
  }

  console.log(`Found ${mirzaLoans.length} loan(s) for Mirza:`);
  mirzaLoans.forEach((l) =>
    console.log(
      `  ID=${l.id} Principal=${l.principal} Monthly=${l.monthlyPayment} TxDate=${l.transactionDate} Tenure=${l.tenureMonths} Remaining=${l.remainingMonths}`,
    ),
  );

  for (const loan of mirzaLoans) {
    if (!loan.transactionDate) {
      console.log(`  ⚠️  Skipping ${loan.id} — no transactionDate`);
      continue;
    }
    if (!loan.tenureMonths || loan.tenureMonths <= 0) {
      console.log(`  ⚠️  Skipping ${loan.id} — no tenureMonths`);
      continue;
    }

    // Step 1: Initialize tracking if not already done
    if (loan.remainingMonths === null || loan.remainingMonths === undefined) {
      console.log(`  ⏳ Initializing tracking for ${loan.id}…`);
      await emiSheet.initializeEmiTracking(loan.id);
      console.log(`  ✅ Initialized with remainingMonths=${loan.tenureMonths}`);
    } else {
      console.log(`  ℹ️  Already initialized: remainingMonths=${loan.remainingMonths}`);
    }

    const monthlyAmt = loan.monthlyPayment;
    if (!monthlyAmt || monthlyAmt <= 0) {
      console.log(`  ⚠️  Skipping ${loan.id} — no monthlyPayment`);
      continue;
    }

    // Step 2: Determine how many monthly payments are already recorded
    // We read the fresh state after initialization
    const fresh = await emiSheet.getEmiLoanRow(loan.id);
    if (!fresh) {
      console.log(`  ⚠️  Could not re-read row for ${loan.id}`);
      continue;
    }

    // Count M/DM/WM entries (full monthly payments) in paidDates
    const existingMonthlyCount = fresh.paidDates.filter((entry) =>
      /:(M|DM|WM)$/.test(entry),
    ).length;

    // Step 3: Determine target: payment months from month 1 up to CUTOFF
    // First payment is due one month after transactionDate
    const paymentsNeeded: string[] = [];
    for (let m = 1; m <= loan.tenureMonths; m++) {
      const payDate = addMonths(loan.transactionDate!, m);
      if (payDate <= CUTOFF) {
        paymentsNeeded.push(payDate);
      } else {
        break;
      }
    }

    const toRecord = paymentsNeeded.length - existingMonthlyCount;
    console.log(
      `  📅 Payments needed up to ${CUTOFF}: ${paymentsNeeded.length}, already recorded: ${existingMonthlyCount}, to record: ${toRecord}`,
    );

    if (toRecord <= 0) {
      console.log(`  ✅ All payments already recorded for ${loan.id}`);
      continue;
    }

    // Record the missing monthly payments in order
    for (let i = existingMonthlyCount; i < paymentsNeeded.length; i++) {
      const payDate = paymentsNeeded[i];
      console.log(`  💳 Recording payment ${i + 1} on ${payDate} (₹${monthlyAmt})…`);
      try {
        await emiSheet.markEmiMonthlyPayment(loan.id, payDate, monthlyAmt);
        console.log(`     ✅ Done`);
      } catch (err) {
        console.error(`     ❌ Error: ${err}`);
      }
    }

    // Verify final state
    const final = await emiSheet.getEmiLoanRow(loan.id);
    console.log(
      `  🏁 Final state: remainingMonths=${final?.remainingMonths} nextPaymentDate=${final?.nextPaymentDate} status=${final?.status}`,
    );
  }

  console.log("\n✅ Backfill complete.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
