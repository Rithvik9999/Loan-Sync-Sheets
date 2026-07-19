import { Router, type IRouter } from "express";
import {
  CreateLoanBody,
  UpdateLoanBody,
  GetLoanParams,
  UpdateLoanParams,
  DeleteLoanParams,
  ListLoansResponse,
  CreateLoanResponse,
  GetLoanResponse,
  UpdateLoanResponse,
} from "@workspace/api-zod";
import { attachRole, requireStaff } from "../middlewares/auth";
import * as loansRepo from "../lib/repositories/loans";
import * as borrowersRepo from "../lib/repositories/borrowers";
import { attachBorrowerId } from "../lib/repositories/loans";
import { extractPhoneFromWhatsapp, normalizePhone, normalizeName } from "../lib/authTokens";

const router: IRouter = Router();

router.use(attachRole);

router.get("/loans", async (req, res): Promise<void> => {
  const info = req.roleInfo!;
  const [loans, borrowers] = await Promise.all([
    loansRepo.listLoans(),
    borrowersRepo.listBorrowers(),
  ]);

  let enriched = loans.map((l) => attachBorrowerId(l, borrowers));

  if (info.role === "borrower") {
    const myPhone = normalizePhone(info.phone ?? "");
    const myName = normalizeName(info.name);
    enriched = enriched.filter((l) => {
      const rowPhone = extractPhoneFromWhatsapp(l.whatsapp);
      const phoneMatch = !!(rowPhone && myPhone && rowPhone === myPhone);
      const nameMatch = normalizeName(l.name) === myName;
      // Only fall back to name matching when the sheet row has no extractable
      // phone number (data gap in the WhatsApp column). If the row does have a
      // phone, require an exact phone match — name-only matching across rows
      // that have phones risks exposing one borrower's loans to another
      // borrower who happens to share the same normalized name.
      return rowPhone ? phoneMatch : nameMatch;
    });
  }

  // For borrowers, remap Archived → Pending so they see the loan as still active
  const forRole =
    info.role === "borrower"
      ? enriched.map((l) =>
          l.status === "Archived" ? { ...l, status: "Pending" as const } : l,
        )
      : enriched;

  const status = req.query.status;
  const filtered =
    typeof status === "string"
      ? forRole.filter((l) => l.status === status)
      : forRole;

  res.json(ListLoansResponse.parse(filtered));
});

/**
 * GET /loans/borrower-names
 * Returns unique borrower names + phones from the Heat Map sheet.
 * Used to populate the borrower name combobox when recording a loan.
 * Must be registered BEFORE GET /loans/:id to avoid "borrower-names" being
 * treated as a loan ID.
 */
router.get("/loans/borrower-names", requireStaff, async (_req, res): Promise<void> => {
  const loans = await loansRepo.listLoans();
  const nameMap = new Map<string, { name: string; phone: string }>();
  for (const loan of loans) {
    const key = loan.name.trim().toLowerCase();
    if (!nameMap.has(key)) {
      // Use first line of whatsapp field as the phone number
      const phone = (loan.whatsapp ?? "").split(/\n/)[0].trim();
      nameMap.set(key, { name: loan.name.trim(), phone });
    } else if (!nameMap.get(key)!.phone) {
      const phone = (loan.whatsapp ?? "").split(/\n/)[0].trim();
      if (phone) nameMap.get(key)!.phone = phone;
    }
  }
  const result = Array.from(nameMap.values()).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  res.json(result);
});

router.post("/loans", requireStaff, async (req, res): Promise<void> => {
  const parsed = CreateLoanBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const loan = await loansRepo.createLoan(parsed.data);
  const borrowers = await borrowersRepo.listBorrowers();
  res.status(201).json(CreateLoanResponse.parse(attachBorrowerId(loan, borrowers)));
});

router.get("/loans/:id", async (req, res): Promise<void> => {
  const params = GetLoanParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const info = req.roleInfo!;
  const loan = await loansRepo.getLoan(params.data.id);
  if (!loan) {
    res.status(404).json({ error: "Loan not found" });
    return;
  }
  if (info.role === "borrower") {
    const myPhone = normalizePhone(info.phone ?? "");
    const rowPhone = extractPhoneFromWhatsapp(loan.whatsapp);
    const phoneMatch = !!(rowPhone && myPhone && rowPhone === myPhone);
    const nameMatch = normalizeName(loan.name) === normalizeName(info.name);
    const allowed = rowPhone ? phoneMatch : nameMatch;
    if (!allowed) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
  }
  const borrowers = await borrowersRepo.listBorrowers();
  res.json(GetLoanResponse.parse(attachBorrowerId(loan, borrowers)));
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
    const borrowers = await borrowersRepo.listBorrowers();
    res.json(UpdateLoanResponse.parse(attachBorrowerId(loan, borrowers)));
  },
);

/**
 * POST /loans/:id/part-payment
 * Appends a new part-payment entry to the loan's stacked list.
 * Updates both Q (partPayment sum) and R (stacked date:amount string).
 */
router.post(
  "/loans/:id/part-payment",
  requireStaff,
  async (req, res): Promise<void> => {
    const id = (req.params as { id: string }).id;
    if (!id) { res.status(400).json({ error: "id is required" }); return; }
    const { amount, date } = req.body as { amount?: unknown; date?: unknown };
    if (typeof amount !== "number" || amount <= 0) {
      res.status(400).json({ error: "amount must be a positive number" });
      return;
    }
    if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      res.status(400).json({ error: "date must be a YYYY-MM-DD string" });
      return;
    }
    const loan = await loansRepo.updateLoan(id, { appendPartPayment: { amount, date } });
    if (!loan) { res.status(404).json({ error: "Loan not found" }); return; }
    const borrowers = await borrowersRepo.listBorrowers();
    res.json(attachBorrowerId(loan, borrowers));
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

export default router;
