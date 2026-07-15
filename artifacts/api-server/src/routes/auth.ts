import { Router, type IRouter } from "express";
import { LoginBody, LoginResponse } from "@workspace/api-zod";
import {
  ADMIN_PHONE,
  SESSION_COOKIE,
  comparePassword,
  normalizePhone,
  signSession,
} from "../lib/authTokens";
import { getBorrowerByPhone } from "../lib/repositories/borrowers";

const router: IRouter = Router();

const COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  maxAge: 30 * 24 * 60 * 60 * 1000,
  path: "/",
};

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const phone = normalizePhone(parsed.data.phone);
  const { password } = parsed.data;

  if (phone === ADMIN_PHONE) {
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminPassword || password !== adminPassword) {
      res.status(401).json({ error: "Invalid phone number or password" });
      return;
    }
    const token = signSession({
      role: "staff",
      borrowerId: null,
      name: "Admin",
      phone,
    });
    res.cookie(SESSION_COOKIE, token, COOKIE_OPTIONS);
    res.json(
      LoginResponse.parse({
        role: "staff",
        borrowerId: null,
        name: "Admin",
        phone,
      }),
    );
    return;
  }

  const borrower = await getBorrowerByPhone(phone);
  const valid =
    borrower && (await comparePassword(password, borrower.passwordHash));
  if (!borrower || !valid) {
    res.status(401).json({ error: "Invalid phone number or password" });
    return;
  }

  const token = signSession({
    role: "borrower",
    borrowerId: borrower.id,
    name: borrower.name,
    phone,
  });
  res.cookie(SESSION_COOKIE, token, COOKIE_OPTIONS);
  res.json(
    LoginResponse.parse({
      role: "borrower",
      borrowerId: borrower.id,
      name: borrower.name,
      phone,
    }),
  );
});

router.post("/auth/logout", (_req, res): void => {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  res.sendStatus(204);
});

export default router;
