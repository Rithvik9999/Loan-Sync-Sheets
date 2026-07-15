import { Router, type IRouter } from "express";
import {
  GetDashboardSummaryResponse,
  GetRecentActivityResponse,
} from "@workspace/api-zod";
import { attachRole, requireStaff } from "../middlewares/auth";
import * as loansRepo from "../lib/repositories/loans";
import * as borrowersRepo from "../lib/repositories/borrowers";

const router: IRouter = Router();

router.use(attachRole, requireStaff);

const DUE_SOON_DAYS = 7;

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const [loans, borrowers] = await Promise.all([
    loansRepo.listLoans(),
    borrowersRepo.listBorrowers(),
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
    totalCollected += loan.paid ?? 0;
    if (loan.status !== "Pending") continue;

    activeLoansCount += 1;
    totalOutstanding += loan.finalAmount ?? 0;

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

  // Heat Map rows carry no timestamp column; row order (append order) is the
  // best available proxy for recency, so the most recently added rows are
  // the most recent activity.
  const recent = [...loans]
    .sort((a, b) => b.rowNumber - a.rowNumber)
    .slice(0, 20);

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
