import { Router, type IRouter } from "express";
import { GetMeResponse } from "@workspace/api-zod";
import { attachRole } from "../middlewares/auth";
import { getBorrower } from "../lib/repositories/borrowers";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.get("/me", attachRole, async (req, res): Promise<void> => {
  const info = req.roleInfo!;

  let creditLimit: number | null = null;
  if (info.role === "borrower" && info.borrowerId) {
    try {
      const borrower = await getBorrower(info.borrowerId);
      logger.info(
        {
          borrowerId: info.borrowerId,
          borrowerFound: !!borrower,
          rawCreditLimit: borrower?.creditLimit,
          creditLimitType: typeof borrower?.creditLimit,
        },
        "me: credit limit lookup",
      );
      creditLimit = borrower?.creditLimit ?? null;
    } catch (err) {
      logger.error({ err, borrowerId: info.borrowerId }, "me: getBorrower failed");
    }
  } else {
    logger.info(
      { role: info.role, borrowerId: info.borrowerId },
      "me: skipping credit limit (not borrower or no borrowerId)",
    );
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
