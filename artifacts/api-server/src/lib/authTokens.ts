/**
 * Phone + 6-digit PIN authentication.
 *
 * Sessions are stateless signed JWTs stored in an httpOnly cookie — no
 * server-side session store, which keeps this Vercel/serverless-friendly.
 *
 * The single owner/lender always logs in as admin via ADMIN_PHONE, checked
 * against the ADMIN_PIN secret (never written to the spreadsheet).
 * Borrowers log in with their own phone number + a 6-digit PIN that staff
 * sets for them (stored in plain text in the Borrowers sheet tab — there is
 * no self-service signup or PIN reset; borrowers must contact staff).
 */
import jwt from "jsonwebtoken";

export const SESSION_COOKIE = "borrowapp_session";
export const ADMIN_PHONE = "8917656405";
export const PIN_PATTERN = /^\d{6}$/;

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
  const digits = phone.replace(/\D/g, "");
  // Strip country code 91 when followed by exactly 10 digits (e.g. 919876543210)
  if (/^91\d{10}$/.test(digits)) return digits.slice(2);
  // Strip leading 0 when followed by exactly 10 digits (e.g. 09876543210)
  if (/^0\d{10}$/.test(digits)) return digits.slice(1);
  return digits;
}

/**
 * Extracts and normalizes a phone number from a loan/EMI row's `whatsapp`
 * field. The phone is the first line/token; subsequent lines are notes.
 * Returns an empty string if no usable phone is found.
 */
/**
 * Normalises a borrower name for comparison: trim, lowercase, collapse all
 * whitespace. "Mohan Rakesh" and "MohanRakesh" both become "mohanrakesh".
 */
export function normalizeName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, "");
}

export function extractPhoneFromWhatsapp(whatsapp: string | null | undefined): string {
  if (!whatsapp) return "";
  const firstLine = whatsapp.split(/\n/)[0].trim();
  return normalizePhone(firstLine);
}
