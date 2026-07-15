import { Router, type IRouter } from "express";
import { attachRole, requireStaff } from "../middlewares/auth";
import * as emiSheet from "../lib/emiSheet";
import * as borrowersRepo from "../lib/repositories/borrowers";

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
    const myName = info.borrower?.name.trim().toLowerCase();
    result = rows.filter((r) => r.name.trim().toLowerCase() === myName);
  }

  // Attach borrowerId by name match
  const enriched = result.map((r) => {
    const b = borrowers.find(
      (bw) => bw.name.trim().toLowerCase() === r.name.trim().toLowerCase(),
    );
    return { ...r, borrowerId: b?.id ?? null };
  });

  res.json(enriched);
});

// POST /api/emi-loans — create (staff only)
router.post("/emi-loans", requireStaff, async (req, res): Promise<void> => {
  const { name, transactionDate, principal, tenureMonths, whatsapp, discountPerMonth, status, statusNotes, notes } = req.body;
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
    });
    res.status(201).json(row);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/emi-loans/:id — get one
router.get("/emi-loans/:id", async (req, res): Promise<void> => {
  const { id } = req.params;
  const info = req.roleInfo!;
  const row = await emiSheet.getEmiLoanRow(id);
  if (!row) {
    res.status(404).json({ error: "EMI loan not found" });
    return;
  }
  if (
    info.role === "borrower" &&
    row.name.trim().toLowerCase() !== info.borrower?.name.trim().toLowerCase()
  ) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }
  res.json(row);
});

// PATCH /api/emi-loans/:id — update (staff only)
router.patch("/emi-loans/:id", requireStaff, async (req, res): Promise<void> => {
  const { id } = req.params;
  const updated = await emiSheet.updateEmiLoanRow(id, req.body);
  if (!updated) {
    res.status(404).json({ error: "EMI loan not found" });
    return;
  }
  res.json(updated);
});

// DELETE /api/emi-loans/:id — delete (staff only)
router.delete("/emi-loans/:id", requireStaff, async (req, res): Promise<void> => {
  const { id } = req.params;
  const deleted = await emiSheet.deleteEmiLoanRow(id);
  if (!deleted) {
    res.status(404).json({ error: "EMI loan not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
