/**
 * Temporary admin backfill endpoint — records Mirza's historical EMI payments.
 * Protected by a static key so it is not publicly accessible.
 * Remove this file after the backfill has been executed.
 */
import { Router, type IRouter } from "express";
import * as emiSheet from "../lib/emiSheet";

const BACKFILL_KEY = "mirza-backfill-2026";
const CUTOFF = "2026-07-14"; // record payments UP TO AND INCLUDING this date

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

const router: IRouter = Router();

router.post("/admin/backfill", async (req, res): Promise<void> => {
  const key = String(req.query.key ?? req.body?.key ?? "");
  if (key !== BACKFILL_KEY) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const log: string[] = [];
  const say = (msg: string) => { log.push(msg); console.log("[backfill]", msg); };

  try {
    say("Loading EMI loans…");
    const rows = await emiSheet.listEmiLoanRows();

    const mirzaLoans = rows.filter((r) =>
      (r.name ?? "").toLowerCase().includes("mirza"),
    );

    if (mirzaLoans.length === 0) {
      say("❌ No loans found for Mirza.");
      say("All names: " + rows.map((r) => `${r.id}:${r.name}:${r.principal}`).join(", "));
      res.json({ ok: false, log });
      return;
    }

    say(`Found ${mirzaLoans.length} loan(s) for Mirza`);

    for (const loan of mirzaLoans) {
      say(`--- Loan ${loan.id} principal=${loan.principal} monthly=${loan.monthlyPayment} txDate=${loan.transactionDate} tenure=${loan.tenureMonths} remaining=${loan.remainingMonths}`);

      if (!loan.transactionDate) { say("  ⚠️ No transactionDate, skipping"); continue; }
      if (!loan.tenureMonths || loan.tenureMonths <= 0) { say("  ⚠️ No tenureMonths, skipping"); continue; }
      const monthlyAmt = loan.monthlyPayment;
      if (!monthlyAmt || monthlyAmt <= 0) { say("  ⚠️ No monthlyPayment, skipping"); continue; }

      // Initialize tracking if needed
      let current = loan;
      if (current.remainingMonths == null) {
        say("  ⏳ Initializing tracking…");
        const initialized = await emiSheet.initializeEmiTracking(loan.id);
        if (initialized) {
          current = initialized;
          say(`  ✅ Initialized: remainingMonths=${current.remainingMonths}`);
        }
      } else {
        say(`  ℹ️ Already initialized: remainingMonths=${current.remainingMonths}`);
      }

      // Re-read to get current paidDates
      const fresh = await emiSheet.getEmiLoanRow(loan.id);
      if (!fresh) { say("  ❌ Could not re-read row"); continue; }

      const existingMonthlyCount = fresh.paidDates.filter((e) => /:(M|DM|WM)$/.test(e)).length;
      say(`  Existing monthly payments: ${existingMonthlyCount}`);
      say(`  paidDates: ${fresh.paidDates.join(" | ")}`);

      // Build list of payment dates up to CUTOFF
      const needed: string[] = [];
      for (let m = 1; m <= loan.tenureMonths; m++) {
        const payDate = addMonths(loan.transactionDate!, m);
        if (payDate <= CUTOFF) needed.push(payDate);
        else break;
      }
      say(`  Payments needed up to ${CUTOFF}: ${needed.join(", ")}`);

      const toRecord = needed.length - existingMonthlyCount;
      say(`  To record: ${toRecord}`);
      if (toRecord <= 0) { say("  ✅ Already up to date"); continue; }

      for (let i = existingMonthlyCount; i < needed.length; i++) {
        const payDate = needed[i];
        say(`  💳 Recording payment ${i + 1} on ${payDate} ₹${monthlyAmt}…`);
        try {
          await emiSheet.markEmiMonthlyPayment(loan.id, payDate, monthlyAmt);
          say(`     ✅ OK`);
        } catch (err) {
          say(`     ❌ Error: ${String(err)}`);
        }
      }

      const final = await emiSheet.getEmiLoanRow(loan.id);
      say(`  🏁 Final: remainingMonths=${final?.remainingMonths} nextPaymentDate=${final?.nextPaymentDate} status=${final?.status}`);
    }

    say("✅ Done");
    res.json({ ok: true, log });
  } catch (err) {
    say(`Fatal error: ${String(err)}`);
    res.status(500).json({ ok: false, log, error: String(err) });
  }
});

export default router;
