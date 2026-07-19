import { Router, type IRouter } from "express";
import { attachRole, requireStaff } from "../middlewares/auth";
import * as emiSheet from "../lib/emiSheet";
import * as emiPaymentsRepo from "../lib/repositories/emiPayments";
import * as borrowersRepo from "../lib/repositories/borrowers";
import { extractPhoneFromWhatsapp, normalizePhone, normalizeName } from "../lib/authTokens";

const router: IRouter = Router();
router.use(attachRole);

// GET /api/emi-loans — list all (staff sees all, borrower sees own)
router.get("/emi-loans", async (req, res): Promise<void> => {
  const info = req.roleInfo!;
  const [rows, borrowers] = await Promise.all([
    emiSheet.listEmiLoanRows(),
    borrowersRepo.listBorrowers(),
  ]);

  let result = rows;
  if (info.role === "borrower") {
    const myPhone = normalizePhone(info.phone ?? "");
    const myName = normalizeName(info.name);
    result = rows.filter((r) => {
      const rowPhone = extractPhoneFromWhatsapp(r.whatsapp);
      const phoneMatch = !!(rowPhone && myPhone && rowPhone === myPhone);
      const nameMatch = normalizeName(r.name) === myName;
      // Accept if phone matches OR name matches — a phone format mismatch
      // between the sheet's WhatsApp column and the Borrowers tab should not
      // silently hide loans that clearly belong to this borrower by name.
      return phoneMatch || nameMatch;
    });
  }

  // Attach borrowerId — phone-first, then name fallback
  const enriched = result.map((r) => {
    const rowPhone = extractPhoneFromWhatsapp(r.whatsapp);
    let b = rowPhone
      ? borrowers.find((bw) => normalizePhone(bw.phone) === rowPhone)
      : undefined;
    if (!b) {
      b = borrowers.find(
        (bw) => normalizeName(bw.name) === normalizeName(r.name),
      );
    }
    return { ...r, borrowerId: b?.id ?? null };
  });

  res.json(enriched);
});

// POST /api/emi-loans — create (staff only)
router.post("/emi-loans", requireStaff, async (req, res): Promise<void> => {
  const { name, transactionDate, principal, tenureMonths, whatsapp, discountPerMonth, status, statusNotes, notes, dailyAmount, weeklyAmount, bimonthlyAmount } = req.body;
  if (!name || !transactionDate || principal == null || !tenureMonths) {
    res.status(400).json({ error: "name, transactionDate, principal, and tenureMonths are required" });
    return;
  }
  try {
    const row = await emiSheet.createEmiLoanRow({
      name,
      transactionDate,
      principal: Number(principal),
      tenureMonths: Number(tenureMonths),
      whatsapp: whatsapp ?? null,
      discountPerMonth: discountPerMonth != null ? Number(discountPerMonth) : null,
      status: status ?? "Pending",
      statusNotes: statusNotes ?? null,
      notes: notes ?? null,
      bimonthlyAmount: bimonthlyAmount != null ? Number(bimonthlyAmount) : null,
    });
    // Write optional quick-pay override amounts after creation (cols U/V already handled by emiInputCellUpdates via bimonthlyAmount)
    if (dailyAmount != null || weeklyAmount != null) {
      await emiSheet.updateEmiLoanRow(row.id, {
        dailyAmount: dailyAmount != null ? Number(dailyAmount) : undefined,
        weeklyAmount: weeklyAmount != null ? Number(weeklyAmount) : undefined,
      });
    }
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/emi-loans/:id — get one
router.get("/emi-loans/:id", async (req, res): Promise<void> => {
  const id = String(req.params.id);
  const info = req.roleInfo!;
  const row = await emiSheet.getEmiLoanRow(id);
  if (!row) {
    res.status(404).json({ error: "EMI loan not found" });
    return;
  }
  if (info.role === "borrower") {
    const myPhone = normalizePhone(info.phone ?? "");
    const rowPhone = extractPhoneFromWhatsapp(row.whatsapp);
    const allowed =
      rowPhone && myPhone
        ? rowPhone === myPhone
        : row.name.trim().toLowerCase() === info.name.trim().toLowerCase();
    if (!allowed) {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
  }
  res.json(row);
});

// POST /api/emi-loans/:id/pay — mark one month as paid and advance to next month (staff only)
router.post("/emi-loans/:id/pay", requireStaff, async (req, res): Promise<void> => {
  const id = String(req.params.id);
  const { paidDate, paidAmount } = req.body;
  if (!paidDate) {
    res.status(400).json({ error: "paidDate (YYYY-MM-DD) is required" });
    return;
  }
  try {
    const updated = await emiSheet.markEmiMonthlyPayment(
      id,
      String(paidDate),
      paidAmount != null ? Number(paidAmount) : undefined,
    );
    if (!updated) {
      res.status(404).json({ error: "EMI loan not found" });
      return;
    }
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/emi-loans/:id/pay-partial — record a daily or weekly partial payment (staff only)
router.post("/emi-loans/:id/pay-partial", requireStaff, async (req, res): Promise<void> => {
  const id = String(req.params.id);
  const { date, amount, frequency } = req.body;
  if (!date || amount == null || !["D", "W", "BM"].includes(frequency)) {
    res.status(400).json({ error: "date, amount, and frequency ('D', 'W', or 'BM') are required" });
    return;
  }
  try {
    const updated = await emiSheet.recordPartialEmiPayment(
      id,
      String(date),
      Number(amount),
      frequency as "D" | "W" | "BM",
    );
    if (!updated) { res.status(404).json({ error: "EMI loan not found" }); return; }
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/emi-loans/:id/undo — undo the last payment entry (staff only)
router.post("/emi-loans/:id/undo", requireStaff, async (req, res): Promise<void> => {
  const id = String(req.params.id);
  try {
    const updated = await emiSheet.undoLastEmiPayment(id);
    if (!updated) { res.status(404).json({ error: "EMI loan not found" }); return; }
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/emi-loans/:id/initialize — initialise server-managed tracking for legacy EMIs (staff only)
router.post("/emi-loans/:id/initialize", requireStaff, async (req, res): Promise<void> => {
  const id = String(req.params.id);
  try {
    const updated = await emiSheet.initializeEmiTracking(id);
    if (!updated) {
      res.status(404).json({ error: "EMI loan not found" });
      return;
    }
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/emi-loans/:id/payments — list partial payment records for an EMI loan
router.get("/emi-loans/:id/payments", async (req, res): Promise<void> => {
  const id = String(req.params.id);
  const info = req.roleInfo!;
  if (info.role === "borrower") {
    const row = await emiSheet.getEmiLoanRow(id);
    if (!row) { res.status(404).json({ error: "EMI loan not found" }); return; }
    const myPhone = normalizePhone(info.phone ?? "");
    const rowPhone = extractPhoneFromWhatsapp(row.whatsapp);
    const allowed = rowPhone && myPhone ? rowPhone === myPhone : row.name.trim().toLowerCase() === info.name.trim().toLowerCase();
    if (!allowed) { res.status(403).json({ error: "Forbidden" }); return; }
  }
  const payments = await emiPaymentsRepo.listEmiPayments(id);
  res.json(payments);
});

// POST /api/emi-loans/:id/payments — add a partial payment record (staff only)
router.post("/emi-loans/:id/payments", requireStaff, async (req, res): Promise<void> => {
  const id = String(req.params.id);
  const { amount, date, monthKey, note } = req.body;
  if (!amount || !date || !monthKey) {
    res.status(400).json({ error: "amount, date (YYYY-MM-DD), and monthKey (YYYY-MM) are required" });
    return;
  }
  try {
    const payment = await emiPaymentsRepo.createEmiPayment(id, Number(amount), String(date), String(monthKey), note ?? "");
    res.status(201).json(payment);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// PATCH /api/emi-loans/:id — update (staff only)
router.patch("/emi-loans/:id", requireStaff, async (req, res): Promise<void> => {
  const id = String(req.params.id);
  const updated = await emiSheet.updateEmiLoanRow(id, req.body);
  if (!updated) {
    res.status(404).json({ error: "EMI loan not found" });
    return;
  }
  res.json(updated);
});

// DELETE /api/emi-loans/:id — delete (staff only)
router.delete("/emi-loans/:id", requireStaff, async (req, res): Promise<void> => {
  const id = String(req.params.id);
  const deleted = await emiSheet.deleteEmiLoanRow(id);
  if (!deleted) {
    res.status(404).json({ error: "EMI loan not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
