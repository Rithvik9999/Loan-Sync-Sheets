/**
 * Generic Google Sheets-as-database client.
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

/** Exposed so other sheet modules (e.g. emiSheet) can reuse the same client. */
export function getSheetsClient(): sheets_v4.Sheets {
  return getSheets();
}

export function getSpreadsheetId(): string {
  return getCredentials().sheetId;
}

export function getEmiSpreadsheetId(): string {
  const id = process.env.EMI_GOOGLE_SHEET_ID;
  if (!id) throw new Error("EMI_GOOGLE_SHEET_ID is not set.");
  return id;
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
const ensuredTabsInSheet = new Map<string, Set<string>>();

export async function ensureSheetTab(title: string, headers: string[]): Promise<void> {
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

/** Like ensureSheetTab but for an arbitrary spreadsheet (e.g. the EMI sheet). */
export async function ensureSheetTabInSheet(
  spreadsheetId: string,
  title: string,
  headers: string[],
): Promise<void> {
  if (!ensuredTabsInSheet.has(spreadsheetId)) {
    ensuredTabsInSheet.set(spreadsheetId, new Set());
  }
  const cache = ensuredTabsInSheet.get(spreadsheetId)!;
  if (cache.has(title)) return;
  const sheets = getSheets();
  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const existing = meta.data.sheets?.find((s) => s.properties?.title === title);
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
    logger.info({ title, spreadsheetId }, "Created tab in external spreadsheet");
  }
  cache.add(title);
}

/**
 * Read the header row of a sheet tab and return a map of header name → 0-based column index.
 * Falls back to the positional index for any header not present in the sheet's row 1.
 */
async function getSheetHeaderMap(
  title: string,
  fallbackHeaders: string[],
): Promise<Map<string, number>> {
  const sheets = getSheets();
  const spreadsheetId = getSpreadsheetId();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${title}!1:1`,
  });
  const sheetHeaderRow = (res.data.values?.[0] ?? []).map(String);
  const map = new Map<string, number>();
  // Populate from the sheet's actual header row first
  sheetHeaderRow.forEach((h, idx) => map.set(h, idx));
  // Fill in any expected headers that are missing from the sheet using positional fallback
  fallbackHeaders.forEach((h, idx) => {
    if (!map.has(h)) map.set(h, idx);
  });
  return map;
}

export async function readTab(
  title: string,
  headers: string[],
): Promise<{ rows: SheetRow[]; rowNumbers: number[] }> {
  await ensureSheetTab(title, headers);
  const sheets = getSheets();
  const spreadsheetId = getSpreadsheetId();

  // Read the actual header row so we can map by column name rather than positional
  // index. This tolerates sheets whose column order differs from the `headers` array
  // (e.g. a tab that existed before a new column was added to the code).
  const headerMap = await getSheetHeaderMap(title, headers);

  // Determine the furthest right column we need to fetch
  const maxColIdx = Math.max(...headers.map((h) => headerMap.get(h) ?? 0));
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${title}!A2:${columnLetter(Math.max(maxColIdx + 1, headers.length))}`,
  });
  const values = res.data.values ?? [];
  const rows: SheetRow[] = [];
  const rowNumbers: number[] = [];
  values.forEach((row, i) => {
    if (row.every((cell) => cell === undefined || cell === "")) return;
    const obj: SheetRow = {};
    headers.forEach((h) => {
      const colIdx = headerMap.get(h) ?? 0;
      obj[h] = row[colIdx] !== undefined && row[colIdx] !== null ? String(row[colIdx]) : "";
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

  // Use the sheet's actual column order so we write values into the right cells
  // even if the sheet's column order differs from the `headers` array.
  const headerMap = await getSheetHeaderMap(title, headers);
  const maxColIdx = Math.max(...headers.map((h) => headerMap.get(h) ?? 0));
  const rowData: string[] = new Array(maxColIdx + 1).fill("");
  headers.forEach((h) => {
    const colIdx = headerMap.get(h) ?? headers.indexOf(h);
    rowData[colIdx] = row[h] ?? "";
  });

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${title}!A:A`,
    valueInputOption: "RAW",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: [rowData] },
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

  // Use the sheet's actual column order so we write values into the right cells.
  const headerMap = await getSheetHeaderMap(title, headers);
  const maxColIdx = Math.max(...headers.map((h) => headerMap.get(h) ?? 0));
  const rowData: string[] = new Array(maxColIdx + 1).fill("");
  headers.forEach((h) => {
    const colIdx = headerMap.get(h) ?? headers.indexOf(h);
    rowData[colIdx] = row[h] ?? "";
  });

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${title}!A${rowNumber}:${columnLetter(maxColIdx + 1)}${rowNumber}`,
    valueInputOption: "RAW",
    requestBody: { values: [rowData] },
  });
}

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

/** Like getRawValues but for an arbitrary spreadsheet (e.g. EMI sheet). */
export async function getRawValuesFromSheet(
  spreadsheetId: string,
  range: string,
  renderOption: "UNFORMATTED_VALUE" | "FORMATTED_VALUE" | "FORMULA" = "UNFORMATTED_VALUE",
): Promise<unknown[][]> {
  const sheets = getSheets();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range,
    valueRenderOption: renderOption,
  });
  return res.data.values ?? [];
}

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

/** Like batchUpdateCells but for an arbitrary spreadsheet. */
export async function batchUpdateCellsInSheet(
  spreadsheetId: string,
  updates: { range: string; values: (string | number)[][] }[],
): Promise<void> {
  if (updates.length === 0) return;
  const sheets = getSheets();
  await sheets.spreadsheets.values.batchUpdate({
    spreadsheetId,
    requestBody: { valueInputOption: "USER_ENTERED", data: updates },
  });
}

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

/** Like ensureGridRowCount but for an arbitrary spreadsheet. */
export async function ensureGridRowCountForSheet(
  spreadsheetId: string,
  title: string,
  minRows: number,
): Promise<void> {
  const sheets = getSheets();
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
}

/**
 * Inserts a blank row at the given 1-based rowNumber, pushing existing rows down.
 * Uses insertDimension so Sheets adjusts all relative formula references.
 */
export async function insertRowAt(
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
          insertDimension: {
            range: {
              sheetId,
              dimension: "ROWS",
              startIndex: rowNumber - 1, // 0-indexed
              endIndex: rowNumber,
            },
            inheritFromBefore: false,
          },
        },
      ],
    },
  });
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

/** Like deleteRowAt but for an arbitrary spreadsheet. */
export async function deleteRowAtInSheet(
  spreadsheetId: string,
  title: string,
  rowNumber: number,
): Promise<void> {
  const sheets = getSheets();
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
