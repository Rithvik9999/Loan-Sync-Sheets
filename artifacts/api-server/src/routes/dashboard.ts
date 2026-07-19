import { Router, type IRouter } from "express";
import {
  GetDashboardSummaryResponse,
  GetRecentActivityResponse,
} from "@workspace/api-zod";
import { attachRole, requireStaff } from "../middlewares/auth";
import * as loansRepo from "../lib/repositories/loans";
import * as borrowersRepo from "../lib/repositories/borrowers";
import * as emiSheet from "../lib/emiSheet";

const router: IRouter = Router();

router.use("/dashboard", attachRole, requireStaff);

const DUE_SOON_DAYS = 7;

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const [loans, borrowers, emiLoans] = await Promise.all([
    loansRepo.listLoans(),
    borrowersRepo.listBorrowers(),
    emiSheet.listEmiLoanRows(),
  ]);

  const now = Date.now();
  const dueSoonCutoff = now + DUE_SOON_DAYS * 24 * 60 * 60 * 1000;

  let activeLoansCount = 0;
  let totalOutstanding = 0;
  let overdueLoansCount = 0;
  let overdueAmount = 0;
  let dueSoonCount = 0;
  let totalCollected = 0;

  for (const loan of loans) {
    // Collected = total amount actually received across all loans (including cleared)
    totalCollected += loan.paid ?? 0;
    if (loan.status !== "Pending") continue;

    activeLoansCount += 1;
    // Outstanding = what's still owed (finalAmount minus what's already been paid)
    totalOutstanding += Math.max((loan.finalAmount ?? 0) - (loan.paid ?? 0), 0);

    if (loan.lateDays && loan.lateDays > 0) {
      overdueLoansCount += 1;
      overdueAmount += loan.lateFees ?? 0;
    } else if (loan.returnDate) {
      const dueTime = new Date(loan.returnDate).getTime();
      if (!Number.isNaN(dueTime) && dueTime <= dueSoonCutoff) {
        dueSoonCount += 1;
      }
    }
  }

  // Include active EMI loans in the outstanding total
  for (const emi of emiLoans) {
    if (emi.status !== "Pending") {
      // Collected = months paid × monthlyPayment (approximation from paid months)
      const paidMonths = Math.max((emi.tenureMonths ?? 0) - (emi.remainingMonths ?? emi.tenureMonths ?? 0), 0);
      totalCollected += paidMonths * (emi.monthlyPayment ?? 0);
      continue;
    }
    activeLoansCount += 1;
    // EMI outstanding = monthlyPayment × remaining months
    const rem = Math.max(emi.remainingMonths ?? 0, 0);
    totalOutstanding += emi.monthlyPayment != null
      ? emi.monthlyPayment * rem
      : (emi.principal ?? 0);

    if (emi.lateDays && emi.lateDays > 0) {
      overdueLoansCount += 1;
      overdueAmount += emi.lateFees ?? 0;
    } else if (emi.nextPaymentDate) {
      const dueTime = new Date(emi.nextPaymentDate).getTime();
      if (!Number.isNaN(dueTime) && dueTime <= dueSoonCutoff) {
        dueSoonCount += 1;
      }
    }
  }

  res.json(
    GetDashboardSummaryResponse.parse({
      totalBorrowers: borrowers.length,
      activeLoansCount,
      totalOutstanding: Math.round(totalOutstanding * 100) / 100,
      totalCollected: Math.round(totalCollected * 100) / 100,
      overdueLoansCount,
      overdueAmount: Math.round(overdueAmount * 100) / 100,
      dueSoonCount,
    }),
  );
});

router.get("/dashboard/activity", async (_req, res): Promise<void> => {
  const loans = await loansRepo.listLoans();

  // Sort by transactionDate descending (newest first), then by rowNumber as tiebreaker
  const sorted = [...loans].sort((a, b) => {
    const da = a.transactionDate ? new Date(a.transactionDate).getTime() : 0;
    const db = b.transactionDate ? new Date(b.transactionDate).getTime() : 0;
    if (db !== da) return db - da;
    return b.rowNumber - a.rowNumber;
  });

  const recent = sorted.slice(0, 20);

  const items = recent.map((l) => ({
    type: (l.status === "Clear" ? "loan_settled" : "loan_created") as
      | "loan_created"
      | "loan_settled",
    description:
      l.status === "Clear"
        ? `Loan settled for ${l.name}`
        : `Loan recorded for ${l.name}`,
    amount: l.status === "Clear" ? l.paid : l.principal,
    occurredAt: l.transactionDate ?? new Date().toISOString(),
    borrowerName: l.name,
  }));

  res.json(GetRecentActivityResponse.parse({ items }));
});

export default router;
