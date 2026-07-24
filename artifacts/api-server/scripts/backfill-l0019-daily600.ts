/**
 * One-shot: backfill ₹600/day payments for L-0019 (Mirza Sufiyan)
 * from txDate (2026-06-25) up to 2026-07-23, and update notes.
 *
 * Run:  npx tsx scripts/backfill-l0019-daily600.ts
 */
import { listLoanRows, appendLoanActivity } from "../src/lib/heatMapSheet.js";
import { batchUpdateCells } from "../src/lib/sheetsClient.js";

const LOAN_ID = "L-0019";
const DAILY_AMOUNT = 600;
const CUTOFF = "2026-07-23";
const TAB = "Heat Map";

const COL_DATE_PART_PAYMENT = 18; // S
const COL_PART_PAYMENT      = 17; // R
const COL_PART_PAYMENT_TS   = 23; // X
const COL_NOTES             = 21; // V

function colLetter(idx: number) {
  return String.fromCharCode(65 + idx);
}

function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function dateRange(start: string, end: string): string[] {
  const out: string[] = [];
  let cur = addDays(start, 1);
  while (cur <= end) { out.push(cur); cur = addDays(cur, 1); }
  return out;
}

function paidSet(dateOfPartPayment: string | null): Set<string> {
  if (!dateOfPartPayment) return new Set();
  return new Set(
    dateOfPartPayment.split("|").map(e => e.split(":")[0]?.trim()).filter(Boolean) as string[]
  );
}

async function main() {
  console.log("Reading loans…");
  const loans = await listLoanRows();
  const loan = loans.find(l => l.loanId === LOAN_ID);
  if (!loan) throw new Error(`${LOAN_ID} not found`);

  console.log(`Found: ${loan.loanId} — ${loan.name}`);
  console.log(`  txDate=${loan.transactionDate}  status=${loan.status}`);
  console.log(`  current notes: "${loan.notes}"`);
  console.log(`  partPayment=₹${loan.partPayment ?? 0}  paid=₹${loan.paid ?? 0}`);

  const start = loan.transactionDate!;
  const cutoff = loan.returnDate && loan.returnDate < CUTOFF ? loan.returnDate : CUTOFF;
  const allDates = dateRange(start, cutoff);
  const already = paidSet(loan.dateOfPartPayment);
  const missing = allDates.filter(d => !already.has(d));

  console.log(`\nDate range: ${start} → ${cutoff} (${allDates.length} days)`);
  console.log(`Already paid: ${already.size}  Missing: ${missing.length}`);
  if (already.size > 0) console.log(`  Paid dates:`, [...already].sort());

  if (missing.length === 0) {
    console.log("✓ Already fully paid up to cutoff.");
  } else {
    // Build full stacked datePartPayment string
    const existingStack = loan.dateOfPartPayment ?? "";
    const newEntries = missing.map(d => `${d}:${DAILY_AMOUNT}`).join("|");
    const fullStack = existingStack ? `${existingStack}|${newEntries}` : newEntries;

    const totalPartPayment = fullStack.split("|").reduce((sum, e) => {
      const amt = Number(e.split(":")[1] ?? "0");
      return sum + (isNaN(amt) ? 0 : amt);
    }, 0);

    const nowIso = new Date().toISOString();
    const newTs = missing.map(() => nowIso).join("|");
    const prevTs = loan.partPaymentTimestamps.join("|");
    const fullTs = prevTs ? `${prevTs}|${newTs}` : newTs;

    const row = loan.rowNumber;
    const newNotes = "Pay daily 600";

    console.log(`\nWriting ${missing.length} entries (₹${DAILY_AMOUNT} × ${missing.length} = ₹${DAILY_AMOUNT * missing.length})…`);
    console.log(`Updating notes to: "${newNotes}"`);

    await batchUpdateCells([
      { range: `${TAB}!${colLetter(COL_DATE_PART_PAYMENT)}${row}`, values: [[fullStack]] },
      { range: `${TAB}!${colLetter(COL_PART_PAYMENT)}${row}`,      values: [[totalPartPayment]] },
      { range: `${TAB}!${colLetter(COL_PART_PAYMENT_TS)}${row}`,   values: [[fullTs]] },
      { range: `${TAB}!${colLetter(COL_NOTES)}${row}`,             values: [[newNotes]] },
    ]);

    console.log(`✓ Total partPayment now ₹${totalPartPayment}`);
    await appendLoanActivity(
      row,
      `Backfill: ${missing.length} daily payments ₹${DAILY_AMOUNT}/day up to ${CUTOFF} — total ₹${DAILY_AMOUNT * missing.length}`,
    );
  }

  console.log("\n✓ Done.");
}

main().catch(err => { console.error("Fatal:", err); process.exit(1); });
