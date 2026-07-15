import type { NextFunction, Request, Response } from "express";
import { SESSION_COOKIE, verifySession } from "../lib/authTokens";
import { getBorrower } from "../lib/repositories/borrowers";

export type Role = "staff" | "borrower";

export interface RoleInfo {
  role: Role;
  borrowerId: string | null;
  name: string;
  phone: string;
}

declare global {
  namespace Express {
    interface Request {
      roleInfo?: RoleInfo;
    }
  }
}

/**
 * Reads and verifies the session cookie, attaching req.roleInfo. Responds
 * 401 if there's no valid session. For borrowers, re-checks that the linked
 * borrower record still exists (in case staff deleted it after login).
 */
export async function attachRole(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const token = req.cookies?.[SESSION_COOKIE];
  const session = token ? verifySession(token) : null;
  if (!session) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  if (session.role === "borrower") {
    if (!session.borrowerId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const borrower = await getBorrower(session.borrowerId);
    if (!borrower) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
  }

  req.roleInfo = {
    role: session.role,
    borrowerId: session.borrowerId,
    name: session.name,
    phone: session.phone,
  };
  next();
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
