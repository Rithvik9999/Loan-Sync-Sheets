/**
 * Generic Google Sheets-as-database client.
 *
 * Uses a Google service account (no Replit OAuth coupling) to read/write
 * tabs in a single spreadsheet, identified by GOOGLE_SHEET_ID. Each domain
 * table (Borrowers, Loans, Repayments) is a tab with a header row; rows are
 * addressed by their spreadsheet row number for update/delete.
 */
import { google, type sheets_v4 } from "googleapis";
import { logger } from "./logger";

export type SheetRow = Record<string, string>;

let sheetsSingleton: sheets_v4.Sheets | null = null;

function getCredentials() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;
  const sheetId = process.env.GOOGLE_SHEET_ID;
  if (!email || !rawKey || !sheetId) {
    throw new Error(
      "Google Sheets is not configured. Set GOOGLE_SERVICE_ACCOUNT_EMAIL, " +
        "GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY, and GOOGLE_SHEET_ID.",
    );
  }
  // Secrets managers often store the PEM key with literal "\n" sequences.
  const privateKey = rawKey.includes("\\n")
    ? rawKey.replace(/\\n/g, "\n")
    : rawKey;
  return { email, privateKey, sheetId };
}

function getSheets(): sheets_v4.Sheets {
  if (!sheetsSingleton) {
    const { email, privateKey } = getCredentials();
    const auth = new google.auth.JWT({
      email,
      key: privateKey,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });
    sheetsSingleton = google.sheets({ version: "v4", auth });
  }
  return sheetsSingleton;
}

export function getSpreadsheetId(): string {
  return getCredentials().sheetId;
}

function columnLetter(n: number): string {
  let s = "";
  let num = n;
  while (num > 0) {
    const m = (num - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    num = Math.floor((num - 1) / 26);
  }
  return s;
}

const ensuredTabs = new Set<string>();

async function ensureSheetTab(title: string, headers: string[]): Promise<void> {
  if (ensuredTabs.has(title)) return;
  const sheets = getSheets();
  const spreadsheetId = getSpreadsheetId();
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const existing = meta.data.sheets?.find(
    (s) => s.properties?.title === title,
  );
  if (!existing) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId,
      requestBody: { requests: [{ addSheet: { properties: { title } } }] },
    });
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${title}!A1`,
      valueInputOption: "RAW",
      requestBody: { values: [headers] },
    });
    logger.info({ title }, "Created Google Sheet tab");
  }
  ensuredTabs.add(title);
}

/** Reads all data rows from a tab, returning parsed row objects alongside their 1-indexed sheet row numbers. */
export async function readTab(
  title: string,
  headers: string[],
): Promise<{ rows: SheetRow[]; rowNumbers: number[] }> {
  await ensureSheetTab(title, headers);
  const sheets = getSheets();
  const spreadsheetId = getSpreadsheetId();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${title}!A2:${columnLetter(headers.length)}`,
  });
  const values = res.data.values ?? [];
  const rows: SheetRow[] = [];
  const rowNumbers: number[] = [];
  values.forEach((row, i) => {
    if (row.every((cell) => cell === undefined || cell === "")) return;
    const obj: SheetRow = {};
    headers.forEach((h, idx) => {
      obj[h] = row[idx] !== undefined && row[idx] !== null ? String(row[idx]) : "";
    });
    rows.push(obj);
    rowNumbers.push(i + 2);
  });
  return { rows, rowNumbers };
}

export async function appendRow(
  title: string,
  headers: string[],
  row: SheetRow,
): Promise<void> {
  await ensureSheetTab(title, headers);
  const sheets = getSheets();
  const spreadsheetId = getSpreadsheetId();
  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${title}!A:A`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [headers.map((h) => row[h] ?? "")] },
  });
}

export async function updateRowAt(
  title: string,
  rowNumber: number,
  headers: string[],
  row: SheetRow,
): Promise<void> {
  const sheets = getSheets();
  const spreadsheetId = getSpreadsheetId();
  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${title}!A${rowNumber}:${columnLetter(headers.length)}${rowNumber}`,
    valueInputOption: "RAW",
    requestBody: { values: [headers.map((h) => row[h] ?? "")] },
  });
}

/** Reads raw values for an arbitrary range without any header/tab assumptions. */
export async function getRawValues(
  range: string,
  renderOption: "UNFORMATTED_VALUE" | "FORMATTED_VALUE" | "FORMULA" = "UNFORMATTED_VALUE",
): Promise<unknown[][]> {
  const sheets = getSheets();
  const spreadsheetId = getSpreadsheetId();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
    valueRenderOption: renderOption,
  });
  return res.data.values ?? [];
}

/**
 * Writes a set of individual, possibly non-contiguous cell ranges in one call.
 * Unlike updateRowAt, this never touches cells outside the given ranges, so it's
 * safe to use next to array-formula/spilled columns that must not be overwritten.
 */
export async function batchUpdateCells(
  updates: { range: string; values: (string | number)[][] }[],
): Promise<void> {
  if (updates.length === 0) return;
  const sheets = getSheets();
  const spreadsheetId = getSpreadsheetId();
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: { valueInputOption: "USER_ENTERED", data: updates },
  });
}

/**
 * Ensures the tab's physical grid has at least `minRows` rows, growing it
 * with blank rows appended at the bottom if needed. Required before writing
 * to a row number beyond the sheet's current grid size — the Sheets API
 * rejects writes to cells outside `gridProperties.rowCount`, and array
 * formulas can only spill into rows that already exist in the grid.
 */
export async function ensureGridRowCount(
  title: string,
  minRows: number,
): Promise<void> {
  const sheets = getSheets();
  const spreadsheetId = getSpreadsheetId();
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const sheet = meta.data.sheets?.find((s) => s.properties?.title === title);
  const sheetId = sheet?.properties?.sheetId;
  const currentRowCount = sheet?.properties?.gridProperties?.rowCount ?? 0;
  if (sheetId === undefined || sheetId === null) return;
  if (currentRowCount >= minRows) return;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          appendDimension: {
            sheetId,
            dimension: "ROWS",
            length: minRows - currentRowCount,
          },
        },
      ],
    },
  });
  logger.info(
    { title, from: currentRowCount, to: minRows },
    "Grew Google Sheet tab grid to fit new row",
  );
}

export async function deleteRowAt(
  title: string,
  rowNumber: number,
): Promise<void> {
  const sheets = getSheets();
  const spreadsheetId = getSpreadsheetId();
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const sheetId = meta.data.sheets?.find((s) => s.properties?.title === title)
    ?.properties?.sheetId;
  if (sheetId === undefined || sheetId === null) return;
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        {
          deleteDimension: {
            range: {
              sheetId,
              dimension: "ROWS",
              startIndex: rowNumber - 1,
              endIndex: rowNumber,
            },
          },
        },
      ],
    },
  });
}
