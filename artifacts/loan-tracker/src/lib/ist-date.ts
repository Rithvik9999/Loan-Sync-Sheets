const IST_TIME_ZONE = "Asia/Kolkata";

/**
 * Returns today's calendar date in India, independent of the browser/server
 * timezone. Loan and payment dates are date-only values, so using an explicit
 * business timezone avoids the midnight UTC/IST day drift.
 */
export function todayISOIST(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: IST_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Parse a YYYY-MM-DD value as a local calendar date without UTC rollover. */
export function parseDateOnly(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = String(value).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day));
}

/** A Date object representing today's India calendar date at local midnight. */
export function todayDateIST(): Date {
  return parseDateOnly(todayISOIST())!;
}

/** Convert a local calendar Date to YYYY-MM-DD without using toISOString(). */
export function dateToISODate(value: Date): string {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}