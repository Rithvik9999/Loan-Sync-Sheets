import { Router, type IRouter } from "express";
import {
  UpdateLoanRequestBody,
  ListLoanRequestsResponse,
  CreateLoanRequestResponse,
  UpdateLoanRequestResponse,
} from "@workspace/api-zod";
import { z } from "zod";
import { attachRole, requireStaff } from "../middlewares/auth";
import * as loanRequestsRepo from "../lib/repositories/loanRequests";
import * as borrowersRepo from "../lib/repositories/borrowers";
import * as loansRepo from "../lib/repositories/loans";
import { attachBorrowerId } from "../lib/repositories/loans";
import * as emiSheet from "../lib/emiSheet";
import { extractPhoneFromWhatsapp, normalizePhone, normalizeName } from "../lib/authTokens";

const router: IRouter = Router();

router.use(attachRole);

// Flexible body — works for both Loan and EMI request types
const CreateLoanRequestBodyFlex = z.object({
  amount: z.coerce.number().min(0.01, "Amount must be positive"),
  tenureDays: z.coerce.number().min(0).optional().default(0),
  tenureMonths: z.coerce.number().int().min(1).optional().nullable(),
  type: z.enum(["Loan", "EMI"]).optional().default("Loan"),
  purpose: z.string().optional().nullable(),
});

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

  const parsed = CreateLoanRequestBodyFlex.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { amount, tenureDays, tenureMonths, type, purpose } = parsed.data;

  // ── Credit-limit enforcement ──────────────────────────────────────────────
  if (info.borrowerId) {
    try {
      const borrower = await borrowersRepo.getBorrower(info.borrowerId);
      if (borrower?.creditLimit != null && borrower.creditLimit > 0) {
        const myPhone = normalizePhone(info.phone ?? "");
        const myName = normalizeName(info.name);

        const [loans, emiLoans] = await Promise.all([
          loansRepo.listLoans(),
          emiSheet.listEmiLoanRows(),
        ]);

        const matchBorrower = (
          rowPhone: string | null | undefined,
          rowName: string,
        ) => {
          const normRow = rowPhone ? normalizePhone(rowPhone) : null;
          const phoneMatch = !!(normRow && myPhone && normRow === myPhone);
          const nameMatch = normalizeName(rowName) === myName;
          return phoneMatch || nameMatch;
        };

        const activeLoansTotal = loans
          .filter(
            (l) =>
              l.status !== "Clear" &&
              matchBorrower(extractPhoneFromWhatsapp(l.whatsapp), l.name),
          )
          .reduce((sum, l) => sum + (l.principal ?? 0), 0);

        const activeEmiTotal = emiLoans
          .filter(
            (e) =>
              e.status !== "Clear" &&
              matchBorrower(
                extractPhoneFromWhatsapp(e.whatsapp),
                e.name,
              ),
          )
          .reduce((sum, e) => sum + (e.principal ?? 0), 0);

        const currentTotal = activeLoansTotal + activeEmiTotal;
        if (currentTotal + amount > borrower.creditLimit) {
          const remaining = Math.max(0, borrower.creditLimit - currentTotal);
          res.status(400).json({
            error: `Credit limit exceeded. Your limit is ₹${borrower.creditLimit.toLocaleString("en-IN")} and you currently have ₹${currentTotal.toLocaleString("en-IN")} outstanding, leaving ₹${remaining.toLocaleString("en-IN")} available.`,
          });
          return;
        }
      }
    } catch {
      // Non-fatal — proceed without limit check if lookup fails
    }
  }

  const request = await loanRequestsRepo.createLoanRequest({
    name: info.name,
    phone: info.phone,
    borrowerId: info.borrowerId,
    amount,
    tenureDays: type === "EMI" ? 0 : (tenureDays ?? 0),
    tenureMonths: type === "EMI" ? (tenureMonths ?? null) : null,
    type,
    purpose: purpose ?? null,
  });
  res.status(201).json(CreateLoanRequestResponse.parse(request));
});

// ── Pay a loan request: create a Clear loan row in the sheet ─────────────────
const PayLoanRequestBody = z.object({
  discount: z.coerce.number().min(0).default(0),
  transactionDate: z.string().optional(),
  notes: z.string().optional().nullable(),
});

router.post(
  "/loan-requests/:id/pay",
  requireStaff,
  async (req, res): Promise<void> => {
    const parsed = PayLoanRequestBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.message });
      return;
    }

    const requests = await loanRequestsRepo.listLoanRequests();
    const loanRequest = requests.find((r) => r.id === req.params.id);
    if (!loanRequest) {
      res.status(404).json({ error: "Loan request not found" });
      return;
    }
    if (loanRequest.status !== "Pending") {
      res.status(400).json({ error: "Only pending requests can be marked as paid" });
      return;
    }

    const { discount, transactionDate, notes } = parsed.data;
    const principal = loanRequest.amount;
    const finalPaid = Math.max(0, principal - discount);

    // Create the loan row in the Heat Map sheet with Clear status
    const loan = await loansRepo.createLoan({
      name: loanRequest.name,
      transactionDate: transactionDate ?? new Date().toISOString().slice(0, 10),
      principal,
      tenureDays: loanRequest.tenureDays > 0 ? loanRequest.tenureDays : 30,
      whatsapp: loanRequest.phone,
      status: "Clear",
      discountOrCharges: discount > 0 ? -discount : 0,
      notes: notes ?? loanRequest.purpose ?? undefined,
    });

    // Set the paid amount (separate update since createLoan doesn't accept paid)
    await loansRepo.updateLoan(loan.id, { paid: finalPaid });

    // Mark the request as Approved
    await loanRequestsRepo.updateLoanRequestStatus(loanRequest.id, "Approved");

    const borrowers = await borrowersRepo.listBorrowers();
    res.status(201).json({ loan: attachBorrowerId(loan, borrowers) });
  },
);

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
      String(req.params.id),
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
    const request = await loanRequestsRepo.deleteLoanRequest(
      String(req.params.id),
    );
    if (!request) {
      res.status(404).json({ error: "Loan request not found" });
      return;
    }
    res.sendStatus(204);
  },
);

export default router;
