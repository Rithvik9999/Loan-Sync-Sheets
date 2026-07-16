import { Router, type IRouter } from "express";
import { attachRole, requireStaff } from "../middlewares/auth";
import { getLoanRow } from "../lib/heatMapSheet";
import * as loanPaymentsRepo from "../lib/repositories/loanPayments";
import { normalizePhone, normalizeName, extractPhoneFromWhatsapp } from "../lib/authTokens";

const router: IRouter = Router();
router.use(attachRole);

// GET /api/loans/:id/payments — list partial payment records for a loan
router.get("/loans/:id/payments", async (req, res): Promise<void> => {
  const id = String(req.params.id);
  const info = req.roleInfo!;
  if (info.role === "borrower") {
    const row = await getLoanRow(id);
    if (!row) { res.status(404).json({ error: "Loan not found" }); return; }
    const myPhone = normalizePhone(info.phone ?? "");
    const rowPhone = extractPhoneFromWhatsapp(row.whatsapp);
    const myName = normalizeName(info.name);
    const allowed =
      (rowPhone && myPhone && rowPhone === myPhone) ||
      normalizeName(row.name) === myName;
    if (!allowed) { res.status(403).json({ error: "Forbidden" }); return; }
  }
  const payments = await loanPaymentsRepo.listLoanPayments(id);
  res.json(payments);
});

// POST /api/loans/:id/payments — add a partial payment record (staff only)
router.post("/loans/:id/payments", requireStaff, async (req, res): Promise<void> => {
  const id = String(req.params.id);
  const { amount, date, note } = req.body;
  if (!amount || !date) {
    res.status(400).json({ error: "amount and date (YYYY-MM-DD) are required" });
    return;
  }
  try {
    const payment = await loanPaymentsRepo.createLoanPayment(
      id,
      Number(amount),
      String(date),
      note ?? "",
    );
    res.status(201).json(payment);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
