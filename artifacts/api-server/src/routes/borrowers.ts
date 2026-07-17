import { Router, type IRouter } from "express";
import {
  GetBorrowerParams,
  UpdateBorrowerParams,
  DeleteBorrowerParams,
  ListBorrowersResponse,
  GetBorrowerResponse,
  UpdateBorrowerResponse,
} from "@workspace/api-zod";
import { attachRole, requireStaff } from "../middlewares/auth";
import * as borrowersRepo from "../lib/repositories/borrowers";
import { toPublic, updateBorrowerPin } from "../lib/repositories/borrowers";

const router: IRouter = Router();

router.use("/borrowers", attachRole, requireStaff);

// ── Inline validation helpers (no zod — keeps the bundle simple) ──────────────

function isValidPin(v: unknown): v is string {
  return typeof v === "string" && /^\d{6}$/.test(v);
}

function validateCreateBorrowerBody(body: unknown): {
  ok: true;
  data: { name: string; phone?: string | null; pin?: string | null; creditLimit?: number | null };
} | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Body must be an object" };
  const b = body as Record<string, unknown>;
  if (typeof b.name !== "string" || b.name.trim() === "") return { ok: false, error: "name is required" };
  if (b.pin !== undefined && b.pin !== null && !isValidPin(b.pin)) return { ok: false, error: "PIN must be exactly 6 digits" };
  if (b.creditLimit !== undefined && b.creditLimit !== null) {
    const n = Number(b.creditLimit);
    if (!Number.isFinite(n) || n <= 0) return { ok: false, error: "creditLimit must be a positive number" };
  }
  return {
    ok: true,
    data: {
      name: (b.name as string).trim(),
      phone: typeof b.phone === "string" ? b.phone : null,
      pin: typeof b.pin === "string" ? b.pin : null,
      creditLimit: b.creditLimit != null ? Number(b.creditLimit) : null,
    },
  };
}

function validateUpdateBorrowerBody(body: unknown): {
  ok: true;
  data: { name?: string; phone?: string | null; pin?: string | null; creditLimit?: number | null };
} | { ok: false; error: string } {
  if (!body || typeof body !== "object") return { ok: false, error: "Body must be an object" };
  const b = body as Record<string, unknown>;
  if (b.name !== undefined && (typeof b.name !== "string" || b.name.trim() === "")) return { ok: false, error: "name cannot be empty" };
  if (b.pin !== undefined && b.pin !== null && !isValidPin(b.pin)) return { ok: false, error: "PIN must be exactly 6 digits" };
  if (b.creditLimit !== undefined && b.creditLimit !== null) {
    const n = Number(b.creditLimit);
    if (!Number.isFinite(n) || n <= 0) return { ok: false, error: "creditLimit must be a positive number" };
  }
  return {
    ok: true,
    data: {
      ...(b.name !== undefined ? { name: (b.name as string).trim() } : {}),
      ...(b.phone !== undefined ? { phone: typeof b.phone === "string" ? b.phone : null } : {}),
      ...(b.pin !== undefined ? { pin: typeof b.pin === "string" ? b.pin : null } : {}),
      ...(b.creditLimit !== undefined ? { creditLimit: b.creditLimit != null ? Number(b.creditLimit) : null } : {}),
    },
  };
}

router.get("/borrowers", async (_req, res): Promise<void> => {
  const borrowers = await borrowersRepo.listBorrowers();
  res.json(ListBorrowersResponse.parse(borrowers.map(toPublic)));
});

router.post("/borrowers", async (req, res): Promise<void> => {
  const parsed = validateCreateBorrowerBody(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const borrower = await borrowersRepo.createBorrower(parsed.data);
  res.status(201).json(toPublic(borrower));
});

router.get("/borrowers/:id", async (req, res): Promise<void> => {
  const params = GetBorrowerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const borrower = await borrowersRepo.getBorrower(params.data.id);
  if (!borrower) {
    res.status(404).json({ error: "Borrower not found" });
    return;
  }
  res.json(GetBorrowerResponse.parse(toPublic(borrower)));
});

/**
 * Dedicated PIN-only update. Writes the new PIN to the row identified by `id`
 * AND to every other Borrowers-tab row that shares the same phone — so login
 * (which uses getBorrowerByPhone / first-match-by-phone) always sees the new PIN
 * regardless of duplicate entries in the sheet.
 */
router.patch("/borrowers/:id/pin", async (req, res): Promise<void> => {
  const params = UpdateBorrowerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const { pin } = (req.body ?? {}) as Record<string, unknown>;
  if (!isValidPin(pin)) {
    res.status(400).json({ error: "PIN must be exactly 6 digits" });
    return;
  }
  const borrower = await updateBorrowerPin(params.data.id, pin as string);
  if (!borrower) {
    res.status(404).json({ error: "Borrower not found" });
    return;
  }
  res.json(UpdateBorrowerResponse.parse(toPublic(borrower)));
});

router.patch("/borrowers/:id", async (req, res): Promise<void> => {
  const params = UpdateBorrowerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = validateUpdateBorrowerBody(req.body);
  if (!parsed.ok) {
    res.status(400).json({ error: parsed.error });
    return;
  }
  const borrower = await borrowersRepo.updateBorrower(
    params.data.id,
    parsed.data,
  );
  if (!borrower) {
    res.status(404).json({ error: "Borrower not found" });
    return;
  }
  res.json(UpdateBorrowerResponse.parse(toPublic(borrower)));
});

router.delete("/borrowers/:id", async (req, res): Promise<void> => {
  const params = DeleteBorrowerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const borrower = await borrowersRepo.deleteBorrower(params.data.id);
  if (!borrower) {
    res.status(404).json({ error: "Borrower not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
