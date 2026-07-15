import { Router, type IRouter } from "express";
import {
  CreateLoanRequestBody,
  UpdateLoanRequestBody,
  ListLoanRequestsResponse,
  CreateLoanRequestResponse,
  UpdateLoanRequestResponse,
} from "@workspace/api-zod";
import { attachRole, requireStaff } from "../middlewares/auth";
import * as loanRequestsRepo from "../lib/repositories/loanRequests";

const router: IRouter = Router();

router.use(attachRole);

router.get("/loan-requests", async (req, res): Promise<void> => {
  const info = req.roleInfo!;
  const requests = await loanRequestsRepo.listLoanRequests();
  const filtered =
    info.role === "borrower"
      ? requests.filter((r) => r.borrowerId === info.borrowerId)
      : requests;
  res.json(ListLoanRequestsResponse.parse(filtered));
});

router.post("/loan-requests", async (req, res): Promise<void> => {
  const info = req.roleInfo!;
  if (info.role !== "borrower") {
    res.status(403).json({ error: "Only borrowers can submit loan requests" });
    return;
  }
  const parsed = CreateLoanRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const request = await loanRequestsRepo.createLoanRequest({
    name: info.name,
    phone: info.phone,
    borrowerId: info.borrowerId,
    amount: parsed.data.amount,
    tenureDays: parsed.data.tenureDays,
    purpose: parsed.data.purpose,
  });
  res.status(201).json(CreateLoanRequestResponse.parse(request));
});

router.patch(
  "/loan-requests/:id",
  requireStaff,
  async (req, res): Promise<void> => {
    const parsed = UpdateLoanRequestBody.safeParse(req.body);
    if (!parsed.success || !parsed.data.status) {
      res.status(400).json({ error: "status is required" });
      return;
    }
    const request = await loanRequestsRepo.updateLoanRequestStatus(
      req.params.id,
      parsed.data.status,
    );
    if (!request) {
      res.status(404).json({ error: "Loan request not found" });
      return;
    }
    res.json(UpdateLoanRequestResponse.parse(request));
  },
);

router.delete(
  "/loan-requests/:id",
  requireStaff,
  async (req, res): Promise<void> => {
    const request = await loanRequestsRepo.deleteLoanRequest(req.params.id);
    if (!request) {
      res.status(404).json({ error: "Loan request not found" });
      return;
    }
    res.sendStatus(204);
  },
);

export default router;
