import { Router, type IRouter } from "express";
import {
  CreateRepaymentBody,
  DeleteRepaymentParams,
  ListRepaymentsResponse,
  CreateRepaymentResponse,
} from "@workspace/api-zod";
import { attachRole, requireStaff } from "../middlewares/auth";
import * as repaymentsRepo from "../lib/repositories/repayments";
import * as loansRepo from "../lib/repositories/loans";

const router: IRouter = Router();

router.use(attachRole);

router.get("/repayments", async (req, res): Promise<void> => {
  const info = req.roleInfo!;
  const [repayments, loans] = await Promise.all([
    repaymentsRepo.listRepayments(),
    loansRepo.listLoans(),
  ]);

  let scoped = repayments;
  if (info.role === "borrower") {
    const ownLoanIds = new Set(
      loans
        .filter((l) => l.borrowerId === info.borrower?.id)
        .map((l) => l.id),
    );
    scoped = scoped.filter((r) => ownLoanIds.has(r.loanId));
  }

  const loanId = req.query.loanId;
  if (typeof loanId === "string") {
    scoped = scoped.filter((r) => r.loanId === loanId);
  }

  res.json(ListRepaymentsResponse.parse(scoped));
});

router.post("/repayments", requireStaff, async (req, res): Promise<void> => {
  const parsed = CreateRepaymentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const loan = await loansRepo.getLoan(parsed.data.loanId);
  if (!loan) {
    res.status(400).json({ error: "Unknown loanId" });
    return;
  }
  const repayment = await repaymentsRepo.createRepayment(parsed.data);
  res.status(201).json(CreateRepaymentResponse.parse(repayment));
});

router.delete(
  "/repayments/:id",
  requireStaff,
  async (req, res): Promise<void> => {
    const params = DeleteRepaymentParams.safeParse(req.params);
    if (!params.success) {
      res.status(400).json({ error: params.error.message });
      return;
    }
    const repayment = await repaymentsRepo.deleteRepayment(params.data.id);
    if (!repayment) {
      res.status(404).json({ error: "Repayment not found" });
      return;
    }
    res.sendStatus(204);
  },
);

export default router;
