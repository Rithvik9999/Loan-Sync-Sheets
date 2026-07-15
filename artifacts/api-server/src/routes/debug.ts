import { Router, type IRouter } from "express";
import { attachRole, requireStaff } from "../middlewares/auth";
import { getRawValues, batchUpdateCells } from "../lib/sheetsClient";
import { listBorrowers } from "../lib/repositories/borrowers";

const router: IRouter = Router();

/**
 * Staff-only: returns the raw Borrowers sheet header row (row 1) plus all
 * parsed borrower records. Used to diagnose credit-limit read failures.
 */
router.get("/debug/borrowers", attachRole, requireStaff, async (_req, res): Promise<void> => {
  const [headerRow, borrowers] = await Promise.all([
    getRawValues("Borrowers!1:1", "FORMATTED_VALUE"),
    listBorrowers(),
  ]);

  res.json({
    sheetHeaderRow: headerRow[0] ?? [],
    borrowers: borrowers.map((b) => ({
      id: b.id,
      name: b.name,
      phone: b.phone,
      creditLimit: b.creditLimit,
      creditLimitType: typeof b.creditLimit,
      hasPin: !!b.pin,
    })),
  });
});

/**
 * Staff-only: rewrites the Borrowers sheet header row (row 1) to match the
 * expected schema ["id","name","phone","pin","creditLimit","createdAt"].
 * The data columns are already in the right positions; only the labels differ.
 */
router.post("/debug/fix-borrowers-headers", attachRole, requireStaff, async (_req, res): Promise<void> => {
  const expectedHeaders = ["id", "name", "phone", "pin", "creditLimit", "createdAt"];
  await batchUpdateCells([
    {
      range: "Borrowers!A1:F1",
      values: [expectedHeaders],
    },
  ]);
  res.json({ ok: true, headers: expectedHeaders });
});

export default router;
