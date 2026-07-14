import type { NextFunction, Request, Response } from "express";
import { clerkClient, getAuth } from "@clerk/express";
import {
  getBorrowerByClerkUserId,
  getBorrowerByEmail,
  updateBorrower,
  type Borrower,
} from "../lib/repositories/borrowers";
import { logger } from "../lib/logger";

export type Role = "staff" | "borrower";

export interface RoleInfo {
  role: Role;
  borrower: Borrower | null;
  name: string;
  email: string;
}

declare global {
  namespace Express {
    interface Request {
      roleInfo?: RoleInfo;
    }
  }
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const auth = getAuth(req);
  if (!auth?.userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

/**
 * Resolves the signed-in user's role by matching their Clerk account to a
 * Borrower record. A borrower is matched by clerkUserId first; if not yet
 * linked, we look up their Clerk email and auto-link on first sign-in so
 * borrowers never have to be manually connected. Anyone who doesn't match a
 * borrower record is treated as staff.
 */
export async function attachRole(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const auth = getAuth(req);
  const userId = auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    let borrower = await getBorrowerByClerkUserId(userId);
    const clerkUser = await clerkClient.users.getUser(userId);
    const email = clerkUser.primaryEmailAddress?.emailAddress ?? "";
    const name =
      [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") ||
      email;

    if (!borrower && email) {
      const byEmail = await getBorrowerByEmail(email);
      if (byEmail) {
        borrower = await updateBorrower(byEmail.id, { clerkUserId: userId });
        logger.info(
          { borrowerId: byEmail.id },
          "Linked Clerk account to existing borrower by email",
        );
      }
    }

    req.roleInfo = {
      role: borrower ? "borrower" : "staff",
      borrower,
      name,
      email,
    };
    next();
  } catch (err) {
    req.log.error({ err }, "Failed to resolve role for authenticated user");
    res.status(500).json({ error: "Failed to resolve user role" });
  }
}

export function requireStaff(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.roleInfo?.role !== "staff") {
    res.status(403).json({ error: "Staff access required" });
    return;
  }
  next();
}
