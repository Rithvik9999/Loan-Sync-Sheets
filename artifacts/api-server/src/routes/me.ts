import { Router, type IRouter } from "express";
import { MeInfo } from "@workspace/api-zod";
import { attachRole } from "../middlewares/auth";

const router: IRouter = Router();

router.get("/me", attachRole, (req, res): void => {
  const info = req.roleInfo!;
  res.json(
    MeInfo.parse({
      role: info.role,
      borrowerId: info.borrowerId,
      name: info.name || null,
      email: null,
      phone: info.phone || null,
    }),
  );
});

export default router;
