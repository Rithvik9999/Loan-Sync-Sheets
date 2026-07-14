import { Router, type IRouter } from "express";
import {
  GetDashboardSummaryResponse,
  GetRecentActivityResponse,
} from "@workspace/api-zod";
import { attachRole, requireStaff } from "../middlewares/auth";
import * as loansRepo from "../lib/repositories/loans";
import * as borrowersRepo from "../lib/repositories/borrowers";
import * as repaymentsRepo from "../lib/repositories/repayments";
import {
  computeLoanSchedule,
  effectiveLoanStatus,
  totalPaidForLoan,
  outstandingBalanceForLoan,
} from "../lib/loanCalc";

const router: IRouter = Router();

router.use(attachRole, requireStaff);

router.get("/dashboard/summary", async (_req, res): Promise<void> => {
  const [loans, borrowers, repayments] = await Promise.all([
    loansRepo.listLoans(),
    borrowersRepo.listBorrowers(),
    repaymentsRepo.listRepayments(),
  ]);

  let activeLoansCount = 0;
  let totalOutstanding = 0;
  let overdueLoansCount = 0;
  let overdueAmount = 0;
  let dueSoonCount = 0;

  for (const loan of loans) {
    const status = effectiveLoanStatus(loan, repayments);
    const outstanding = outstandingBalanceForLoan(loan, repayments);
    if (status === "active" || status === "overdue") {
      activeLoansCount += 1;
      totalOutstanding += outstanding;
    }
    if (status === "overdue") {
      overdueLoansCount += 1;
      overdueAmount += outstanding;
    }
    const schedule = computeLoanSchedule(loan, repayments);
    dueSoonCount += schedule.installments.filter(
      (i) => i.status === "due_soon",
    ).length;
  }

  const totalCollected = repayments.reduce((sum, r) => sum + r.amount, 0);

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
  const [loans, borrowers, repayments] = await Promise.all([
    loansRepo.listLoans(),
    borrowersRepo.listBorrowers(),
    repaymentsRepo.listRepayments(),
  ]);
  const borrowerNameByLoanId = new Map(
    loans.map((l) => [
      l.id,
      borrowers.find((b) => b.id === l.borrowerId)?.name ?? "Unknown",
    ]),
  );
  const borrowerNameById = new Map(borrowers.map((b) => [b.id, b.name]));

  const loanEvents = loans.map((l) => ({
    type: "loan_created" as const,
    description: `New loan created for ${borrowerNameById.get(l.borrowerId) ?? "Unknown"}`,
    amount: l.principal,
    occurredAt: l.createdAt,
    borrowerName: borrowerNameById.get(l.borrowerId) ?? null,
  }));

  const repaymentEvents = repayments.map((r) => ({
    type: "repayment_recorded" as const,
    description: `Repayment recorded for ${borrowerNameByLoanId.get(r.loanId) ?? "Unknown"}`,
    amount: r.amount,
    occurredAt: r.createdAt,
    borrowerName: borrowerNameByLoanId.get(r.loanId) ?? null,
  }));

  const items = [...loanEvents, ...repaymentEvents]
    .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))
    .slice(0, 20);

  res.json(GetRecentActivityResponse.parse({ items }));
});

export default router;
