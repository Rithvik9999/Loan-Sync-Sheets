/**
 * Phone + password authentication.
 *
 * Sessions are stateless signed JWTs stored in an httpOnly cookie — no
 * server-side session store, which keeps this Vercel/serverless-friendly.
 *
 * The single owner/lender always logs in as admin via ADMIN_PHONE, checked
 * against the ADMIN_PASSWORD secret (never written to the spreadsheet).
 * Borrowers log in with their own phone number + a password that staff sets
 * for them (stored as a bcrypt hash in the Borrowers sheet tab — there is no
 * self-service signup).
 */
import jwt from "jsonwebtoken";
import bcrypt from "bcryptjs";

export const SESSION_COOKIE = "borrowapp_session";
export const ADMIN_PHONE = "8917656405";

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is not configured.");
  }
  return secret;
}

export interface SessionPayload {
  role: "staff" | "borrower";
  borrowerId: string | null;
  name: string;
  phone: string;
}

export function signSession(payload: SessionPayload): string {
  return jwt.sign(payload, getSessionSecret(), { expiresIn: "30d" });
}

export function verifySession(token: string): SessionPayload | null {
  try {
    return jwt.verify(token, getSessionSecret()) as SessionPayload;
  } catch {
    return null;
  }
}

export function normalizePhone(phone: string): string {
  return phone.replace(/\D/g, "").replace(/^91(?=\d{10}$)/, "");
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(
  password: string,
  hash: string,
): Promise<boolean> {
  if (!hash) return false;
  return bcrypt.compare(password, hash);
}
