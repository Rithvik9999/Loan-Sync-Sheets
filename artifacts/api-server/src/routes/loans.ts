import { Router, type IRouter } from "express";
import {
  CreateLoanBody,
  UpdateLoanBody,
  GetLoanParams,
  UpdateLoanParams,
  DeleteLoanParams,
  GetLoanScheduleParams,
  ListLoansResponse,
  CreateLoanResponse,
  GetLoanResponse,
  UpdateLoanResponse,
  GetLoanScheduleResponse,
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
  totalDueForLoan,
} from "../lib/loanCalc";
import type { LoanRecord } from "../lib/repositories/loans";
import type { Repayment } from "../lib/repositories/repayments";

const router: IRouter = Router();

router.use(attachRole);

async function enrichLoan(
  loan: LoanRecord,
  repayments: Repayment[],
  borrowerName: string,
) {
  return {
    ...loan,
    status: effectiveLoanStatus(loan, repayments),
    borrowerName,
    totalPaid: totalPaidForLoan(loan.id, repayments),
    outstandingBalance: outstandingBalanceForLoan(loan, repayments),
  };
}

router.get("/loans", async (req, res): Promise<void> => {
  const info = req.roleInfo!;
  const [loans, borrowers, repayments] = await Promise.all([
    loansRepo.listLoans(),
    borrowersRepo.listBorrowers(),
    repaymentsRepo.listRepayments(),
  ]);
  const borrowerMap = new Map(borrowers.map((b) => [b.id, b.name]));

  let scoped = loans;
  if (info.role === "borrower") {
    scoped = scoped.filter((l) => l.borrowerId === info.borrower?.id);
  } else if (typeof req.query.borrowerId === "string") {
    scoped = scoped.filter((l) => l.borrowerId === req.query.borrowerId);
  }

  const enriched = await Promise.all(
    scoped.map((l) =>
      enrichLoan(l, repayments, borrowerMap.get(l.borrowerId) ?? "Unknown"),
    ),
  );

  const status = req.query.status;
  const filtered =
    typeof status === "string"
      ? enriched.filter((l) => l.status === status)
      : enriched;

  res.json(ListLoansResponse.parse(filtered));
});

router.post("/loans", requireStaff, async (req, res): Promise<void> => {
  const parsed = CreateLoanBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const borrower = await borrowersRepo.getBorrower(parsed.data.borrowerId);
  if (!borrower) {
    res.status(400).json({ error: "Unknown borrowerId" });
    return;
  }
  const loan = await loansRepo.createLoan(parsed.data);
  res.status(201).json(
    CreateLoanResponse.parse({
      ...loan,
      borrowerName: borrower.name,
      totalPaid: 0,
      outstandingBalance: totalDueForLoan(loan),
    }),
  );
});

async function loadLoanForRequest(id: string) {
  const [loan, borrowers, repayments] = await Promise.all([
    loansRepo.getLoan(id),
    borrowersRepo.listBorrowers(),
    repaymentsRepo.listRepayments(),
  ]);
  if (!loan) return null;
  const borrowerName =
    borrowers.find((b) => b.id === loan.borrowerId)?.name ?? "Unknown";
  return { loan, borrowerName, repayments };
}

router.get("/loans/:id", async (req, res): Promise<void> => {
  const params = GetLoanParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const info = req.roleInfo!;
  const found = await loadLoanForRequest(params.data.id);
  if (!found) {
    res.status(404).json({ error: "Loan not found" });
    return;
  }
  if (info.role === "borrower" && found.loan.borrowerId !== info.borrower?.id) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  res.json(
    GetLoanResponse.parse(
      await enrichLoan(found.loan, found.repayments, found.borrowerName),
    ),
  );
});

router.patch(
  "/loans/:id",
  requireStaff,
  async (req, res): Promise<void> => {
    const params = UpdateLoanParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const parsed = UpdateLoanBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }
    const loan = await loansRepo.updateLoan(params.data.id, parsed.data);
    if (!loan) {
      res.status(404).json({ error: "Loan not found" });
      return;
    }
    const [borrowers, repayments] = await Promise.all([
      borrowersRepo.listBorrowers(),
      repaymentsRepo.listRepayments(),
    ]);
    const borrowerName =
      borrowers.find((b) => b.id === loan.borrowerId)?.name ?? "Unknown";
    res.json(
      UpdateLoanResponse.parse(
        await enrichLoan(loan, repayments, borrowerName),
      ),
    );
  },
);

router.delete(
  "/loans/:id",
  requireStaff,
  async (req, res): Promise<void> => {
    const params = DeleteLoanParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const loan = await loansRepo.deleteLoan(params.data.id);
    if (!loan) {
      res.status(404).json({ error: "Loan not found" });
      return;
    }
    res.sendStatus(204);
  },
);

router.get("/loans/:id/schedule", async (req, res): Promise<void> => {
  const params = GetLoanScheduleParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const info = req.roleInfo!;
  const found = await loadLoanForRequest(params.data.id);
  if (!found) {
    res.status(404).json({ error: "Loan not found" });
    return;
  }
  if (info.role === "borrower" && found.loan.borrowerId !== info.borrower?.id) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  const schedule = computeLoanSchedule(found.loan, found.repayments);
  res.json(GetLoanScheduleResponse.parse(schedule));
});

export default router;
