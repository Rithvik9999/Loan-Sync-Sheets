import { Router, type IRouter } from "express";
import { z } from "zod";
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
import { toPublic } from "../lib/repositories/borrowers";

const router: IRouter = Router();

router.use(attachRole, requireStaff);

// Inline schemas (email removed — phone is the primary identity)
const CreateBorrowerBodyLocal = z.object({
  name: z.string().min(1),
  phone: z.string().nullish(),
  password: z.string().min(4).nullish(),
});

const UpdateBorrowerBodyLocal = z.object({
  name: z.string().min(1).optional(),
  phone: z.string().nullish(),
  password: z.string().min(4).nullish(),
});

router.get("/borrowers", async (_req, res): Promise<void> => {
  const borrowers = await borrowersRepo.listBorrowers();
  res.json(ListBorrowersResponse.parse(borrowers.map(toPublic)));
});

router.post("/borrowers", async (req, res): Promise<void> => {
  const parsed = CreateBorrowerBodyLocal.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
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

router.patch("/borrowers/:id", async (req, res): Promise<void> => {
  const params = UpdateBorrowerParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const parsed = UpdateBorrowerBodyLocal.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
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
