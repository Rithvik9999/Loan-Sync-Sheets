import { Router, type IRouter } from "express";
import {
  UpdateLoanRequestBody,
  ListLoanRequestsResponse,
  CreateLoanRequestResponse,
  UpdateLoanRequestResponse,
} from "@workspace/api-zod";
import { attachRole, requireStaff } from "../middlewares/auth";
import * as loanRequestsRepo from "../lib/repositories/loanRequests";
import * as borrowersRepo from "../lib/repositories/borrowers";
import * as loansRepo from "../lib/repositories/loans";
import { attachBorrowerId } from "../lib/repositories/loans";
import * as emiSheet from "../lib/emiSheet";
import { extractPhoneFromWhatsapp, normalizePhone, normalizeName } from "../lib/authTokens";

const router: IRouter = Router();

router.use(attachRole);

// ── Inline validation helpers (no zod in this file to avoid esbuild issues) ──

interface CreateLoanRequestData {
  amount: number;
  tenureDays: number;
  tenureMonths: number | null;
  type: "Loan" | "EMI";
  purpose: string | null;
  upiId: string | null;
}

function validateCreateLoanRequest(body: unknown): { ok: true; data: CreateLoanRequestData } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Body must be an object" };
  const b = body as Record<string, unknown>;
  const amount = Number(b.amount);
  if (!Number.isFinite(amount) || amount < 0.01) return { ok: false, error: "Amount must be positive" };
  const tenureDays = b.tenureDays !== undefined ? Math.max(0, Number(b.tenureDays) || 0) : 0;
  const tenureMonths = b.tenureMonths != null ? (Math.floor(Number(b.tenureMonths)) || null) : null;
  if (tenureMonths !== null && tenureMonths < 1) return { ok: false, error: "tenureMonths must be ≥ 1" };
  const type = (b.type === "EMI" ? "EMI" : "Loan") as "Loan" | "EMI";
  const purpose = typeof b.purpose === "string" ? b.purpose : null;
  const upiId = typeof b.upiId === "string" ? b.upiId : null;
  return { ok: true, data: { amount, tenureDays, tenureMonths, type, purpose, upiId } };
}

interface PayLoanRequestData { discount: number; transactionDate?: string; notes?: string | null; }

function validatePayLoanRequest(body: unknown): { ok: true; data: PayLoanRequestData } | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: true, data: { discount: 0 } };
  const b = body as Record<string, unknown>;
  const discount = Math.max(0, Number(b.discount) || 0);
  const transactionDate = typeof b.transactionDate === "string" ? b.transactionDate : undefined;
  const notes = typeof b.notes === "string" ? b.notes : null;
  return { ok: true, data: { discount, transactionDate, notes } };
}

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

  const parsed = validateCreateLoanRequest(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }

  const { amount, tenureDays, tenureMonths, type, purpose, upiId } = parsed.data;

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
    upiId: upiId ?? null,
  });
  res.status(201).json(CreateLoanRequestResponse.parse(request));
});

// ── Pay a loan request: create a Clear loan row in the sheet ─────────────────

router.post(
  "/loan-requests/:id/pay",
  requireStaff,
  async (req, res): Promise<void> => {
    const parsed = validatePayLoanRequest(req.body);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
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
