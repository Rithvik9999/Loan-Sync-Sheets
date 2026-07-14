import { Router, type IRouter } from "express";
import { GetMeResponse } from "@workspace/api-zod";
import { attachRole } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/me", attachRole, (req, res): void => {
  const info = req.roleInfo!;
  res.json(
    GetMeResponse.parse({
      role: info.role,
      borrowerId: info.borrower?.id ?? null,
      name: info.name || null,
      email: info.email || null,
    }),
  );
});

export default router;
