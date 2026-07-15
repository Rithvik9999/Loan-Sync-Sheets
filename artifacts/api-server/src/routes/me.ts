import { Router, type IRouter } from "express";
import { GetMeResponse } from "@workspace/api-zod";
import { attachRole } from "../middlewares/auth";
import { getBorrower } from "../lib/repositories/borrowers";

const router: IRouter = Router();

router.get("/me", attachRole, async (req, res): Promise<void> => {
  const info = req.roleInfo!;

  let creditLimit: number | null = null;
  if (info.role === "borrower" && info.borrowerId) {
    const borrower = await getBorrower(info.borrowerId);
    creditLimit = borrower?.creditLimit ?? null;
  }

  res.json(
    GetMeResponse.parse({
      role: info.role,
      borrowerId: info.borrowerId,
      name: info.name || null,
      phone: info.phone || null,
      creditLimit,
    }),
  );
});

export default router;
