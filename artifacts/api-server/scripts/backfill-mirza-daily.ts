/**
 * One-shot script: backfill daily payments for Mirza's two Heat Map loans
 * (identified by "pay daily N" in notes) from transactionDate up to 2026-07-23.
 *
 * Run from api-server root:
 *   npx tsx scripts/backfill-mirza-daily.ts
 */
import { listLoanRows, appendLoanActivity } from "../src/lib/heatMapSheet.js";
import { batchUpdateCells } from "../src/lib/sheetsClient.js";

const CUTOFF = "2026-07-23";
const TAB = "Heat Map";

function colLetter(idx: number) {
  return String.fromCharCode(65 + idx);
}
// Column indices (same as heatMapSheet COL)
const COL_DATE_PART_PAYMENT = 18; // S
const COL_PART_PAYMENT      = 17; // R
const COL_PART_PAYMENT_TS   = 23; // X

function addDays(isoDate: string, n: number): string {
  const d = new Date(isoDate + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function dateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  let cur = addDays(startDate, 1); // day after transactionDate is the first due date
  while (cur <= endDate) {
    dates.push(cur);
    cur = addDays(cur, 1);
  }
  return dates;
}

function alreadyPaidDates(dateOfPartPayment: string | null): Set<string> {
  if (!dateOfPartPayment) return new Set();
  return new Set(
    dateOfPartPayment.split("|").map((e) => e.split(":")[0]?.trim()).filter(Boolean) as string[],
  );
}

async function main() {
  console.log("Reading Heat Map loans…");
  const loans = await listLoanRows();
  const mirza = loans.filter(
    (l) =>
      l.name.toLowerCase().includes("mirza") &&
      l.status !== "Clear" &&
      l.status !== "Archived",
  );

  console.log(`Active Mirza loans: ${mirza.length}`);
  for (const l of mirza) {
    const notesLower = (l.notes || "").toLowerCase();
    const dailyMatch = notesLower.match(/pay\s+daily\s+(\d+)/);
    console.log(
      `  ${l.loanId}  principal=₹${l.principal}  daily=${dailyMatch ? "₹" + dailyMatch[1] : "—"}` +
      `  txDate=${l.transactionDate}  notes="${l.notes}"` +
      `  partPayment=₹${l.partPayment ?? 0}  paid=₹${l.paid ?? 0}`,
    );
  }

  for (const loan of mirza) {
    const notesLower = (loan.notes || "").toLowerCase();
    const match = notesLower.match(/pay\s+daily\s+(\d+)/);
    if (!match) {
      console.log(`\nSkipping ${loan.loanId} — no "pay daily N" in notes.`);
      continue;
    }
    const dailyAmount = Number(match[1]);
    const startDate = loan.transactionDate;
    if (!startDate) {
      console.log(`\nSkipping ${loan.loanId} — no transactionDate.`);
      continue;
    }

    const cutoff = loan.returnDate && loan.returnDate < CUTOFF ? loan.returnDate : CUTOFF;
    const allDates = dateRange(startDate, cutoff);
    const paid = alreadyPaidDates(loan.dateOfPartPayment);
    const missing = allDates.filter((d) => !paid.has(d));

    console.log(
      `\n${loan.loanId} (${loan.name})  ₹${dailyAmount}/day  ` +
      `txDate=${startDate}  cutoff=${cutoff}`,
    );
    console.log(
      `  Range: ${allDates.length} days  Already paid: ${paid.size}  Missing: ${missing.length}`,
    );

    if (missing.length === 0) {
      console.log("  ✓ All days already paid up to cutoff.");
      continue;
    }

    // Build the full stacked string in one go
    const existingStack = loan.dateOfPartPayment ?? "";
    const newEntries = missing.map((d) => `${d}:${dailyAmount}`).join("|");
    const fullStack = existingStack ? `${existingStack}|${newEntries}` : newEntries;

    // Recompute total partPayment sum from the full stack
    const totalPartPayment = fullStack
      .split("|")
      .reduce((sum, entry) => {
        const amt = Number(entry.split(":")[1] ?? "0");
        return sum + (isNaN(amt) ? 0 : amt);
      }, 0);

    // Build timestamps — one per new entry (all recorded now)
    const nowIso = new Date().toISOString();
    const newTimestamps = missing.map(() => nowIso).join("|");
    const prevTs = loan.partPaymentTimestamps.join("|");
    const fullTs = prevTs ? `${prevTs}|${newTimestamps}` : newTimestamps;

    const rowNumber = loan.rowNumber;
    const updates = [
      {
        range: `${TAB}!${colLetter(COL_DATE_PART_PAYMENT)}${rowNumber}`,
        values: [[fullStack]],
      },
      {
        range: `${TAB}!${colLetter(COL_PART_PAYMENT)}${rowNumber}`,
        values: [[totalPartPayment]],
      },
      {
        range: `${TAB}!${colLetter(COL_PART_PAYMENT_TS)}${rowNumber}`,
        values: [[fullTs]],
      },
    ];

    console.log(
      `  Writing ${missing.length} entries (₹${dailyAmount} × ${missing.length} = ₹${dailyAmount * missing.length}) in one batch…`,
    );
    await batchUpdateCells(updates);
    console.log(`  ✓ Done. Total partPayment now ₹${totalPartPayment}.`);

    await appendLoanActivity(
      rowNumber,
      `Backfill: ${missing.length} daily payments ₹${dailyAmount}/day up to ${CUTOFF} — total recorded ₹${dailyAmount * missing.length}`,
    );
  }

  console.log("\n✓ All done.");
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
