import { promises as fs } from "fs";
import path from "path";
import type { sheets_v4 } from "googleapis";

import { sheetSchemas, type SheetKey } from "@/lib/schema";

export type SheetRow<T> = T & {
  _rowNumber: number;
};

type SheetValue = string | number | boolean;
type RowData = Record<string, SheetValue>;
type RowMatcher<T> = (row: SheetRow<T>) => boolean;
type CachedRows = {
  expiresAt: number;
  rows: SheetRow<unknown>[];
};
type ListOptions = {
  fresh?: boolean;
};
type DiskCache = Partial<Record<SheetKey, CachedRows>>;
const idColumns: Record<SheetKey, string> = {
  companies: "company_id",
  events: "event_id",
  settings: "setting_id"
};

let sheetsClientPromise: Promise<sheets_v4.Sheets> | null = null;

const rowsCache = new Map<SheetKey, CachedRows>();
const headerCache = new Map<SheetKey, number>();
const rowCacheTtlMs = 5 * 60_000;
const headerCacheTtlMs = 5 * 60_000;
const diskCacheTtlMs = 24 * 60 * 60_000;
const cacheDir = path.join(process.cwd(), ".cache", "job-hunt-note");
const cacheFile = path.join(cacheDir, "sheets-cache.json");

function cacheActive(expiresAt: number) {
  return Date.now() < expiresAt;
}

function getRequiredEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is not set`);
  }

  return value;
}

function getServiceAccountCredentials() {
  const rawJson = getRequiredEnv("GOOGLE_SERVICE_ACCOUNT_JSON");

  try {
    const credentials = JSON.parse(rawJson) as {
      client_email?: string;
      private_key?: string;
    };

    if (!credentials.client_email || !credentials.private_key) {
      throw new Error("client_email or private_key is missing");
    }

    return {
      clientEmail: credentials.client_email,
      privateKey: credentials.private_key.replace(/\\n/g, "\n")
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid JSON";
    throw new Error(`GOOGLE_SERVICE_ACCOUNT_JSON is invalid: ${message}`);
  }
}

async function getSheetsClient() {
  if (sheetsClientPromise) {
    return sheetsClientPromise;
  }

  const credentials = getServiceAccountCredentials();
  sheetsClientPromise = (async () => {
    const { google } = await import("googleapis");
    const auth = new google.auth.JWT({
      email: credentials.clientEmail,
      key: credentials.privateKey,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"]
    });

    return google.sheets({ version: "v4", auth });
  })();
  return sheetsClientPromise;
}

function toRowValues(sheetKey: SheetKey, data: RowData) {
  return sheetSchemas[sheetKey].map((column) => {
    const value = data[column];
    return value === undefined || value === null ? "" : String(value);
  });
}

function expectedColumns(sheetKey: SheetKey) {
  return [...sheetSchemas[sheetKey]];
}

function rowValuesToObject<T>(sheetKey: SheetKey, row: string[], rowNumber: number) {
  const object = sheetSchemas[sheetKey].reduce<Record<string, string>>((acc, column, index) => {
    acc[column] = row[index] ?? "";
    return acc;
  }, {});

  return {
    ...(object as T),
    _rowNumber: rowNumber
  };
}

function dedupeRowsById<T>(sheetKey: SheetKey, rows: SheetRow<T>[]) {
  const idColumn = idColumns[sheetKey];
  const byId = new Map<string, SheetRow<T>>();
  const rowsWithoutId: SheetRow<T>[] = [];

  for (const row of rows) {
    const id = String((row as Record<string, unknown>)[idColumn] ?? "").trim();

    if (!id) {
      rowsWithoutId.push(row);
      continue;
    }

    byId.set(id, row);
  }

  return [...rowsWithoutId, ...byId.values()];
}

async function assertSheetHeader(sheets: Awaited<ReturnType<typeof getSheetsClient>>, sheetKey: SheetKey) {
  const cachedHeader = headerCache.get(sheetKey);

  if (cachedHeader && cacheActive(cachedHeader)) {
    return;
  }

  const spreadsheetId = getRequiredEnv("GOOGLE_SHEETS_ID");
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetKey}!1:1`
  });
  const actual = (response.data.values?.[0] ?? []).map((value: unknown) => String(value).trim());
  const expected = expectedColumns(sheetKey);

  if (canAppendEventColumns(sheetKey, actual, expected)) {
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetKey}!1:1`,
      valueInputOption: "RAW",
      requestBody: { values: [expected] }
    });
    headerCache.set(sheetKey, Date.now() + headerCacheTtlMs);
    return;
  }

  const problems: string[] = [];
  const maxLength = Math.max(actual.length, expected.length);

  for (let index = 0; index < maxLength; index += 1) {
    const expectedColumn = expected[index];
    const actualColumn = actual[index];
    const columnLabel = columnName(index + 1);

    if (expectedColumn === undefined && actualColumn !== undefined) {
      problems.push(`${columnLabel}: unexpected "${actualColumn}"`);
      continue;
    }

    if (expectedColumn !== undefined && actualColumn === undefined) {
      problems.push(`${columnLabel}: missing "${expectedColumn}"`);
      continue;
    }

    if (expectedColumn !== actualColumn) {
      problems.push(`${columnLabel}: expected "${expectedColumn}", got "${actualColumn}"`);
    }
  }

  if (problems.length > 0) {
    throw new Error(`Sheet "${sheetKey}" header mismatch. ${problems.join("; ")}`);
  }

  headerCache.set(sheetKey, Date.now() + headerCacheTtlMs);
}

function canAppendEventColumns(sheetKey: SheetKey, actual: string[], expected: string[]) {
  if (sheetKey !== "events" || actual.length >= expected.length) {
    return false;
  }

  const addedColumns = expected.slice(actual.length);
  const allowedAppendedColumns = new Set(["event_series_id", "series_day_index", "time_mode"]);

  return actual.every((column, index) => column === expected[index]) &&
    addedColumns.every((column) => allowedAppendedColumns.has(column));
}

export async function listSheetRows<T>(sheetKey: SheetKey, options: ListOptions = {}): Promise<SheetRow<T>[]> {
  if (!options.fresh) {
    const cached = rowsCache.get(sheetKey);

    if (cached && cacheActive(cached.expiresAt)) {
      return cached.rows as SheetRow<T>[];
    }

    const diskCached = await readDiskCachedRows<T>(sheetKey);

    if (diskCached) {
      const deduped = dedupeRowsById(sheetKey, diskCached);
      rowsCache.set(sheetKey, {
        expiresAt: Date.now() + rowCacheTtlMs,
        rows: deduped as SheetRow<unknown>[]
      });
      return deduped;
    }
  }

  const sheets = await getSheetsClient();
  const spreadsheetId = getRequiredEnv("GOOGLE_SHEETS_ID");
  await assertSheetHeader(sheets, sheetKey);
  const range = `${sheetKey}!A:Z`;
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range
  });

  const rows = response.data.values ?? [];

  const parsedRows = dedupeRowsById(sheetKey, rows.slice(1).map((row: unknown[], index: number) =>
    rowValuesToObject<T>(sheetKey, row.map((value) => String(value)), index + 2)
  ));
  rowsCache.set(sheetKey, {
    expiresAt: Date.now() + rowCacheTtlMs,
    rows: parsedRows as SheetRow<unknown>[]
  });
  await updateDiskCache(sheetKey, parsedRows as SheetRow<unknown>[], diskCacheTtlMs);

  return parsedRows;
}

export async function readCachedSheetRows<T>(sheetKey: SheetKey): Promise<SheetRow<T>[]> {
  const cached = rowsCache.get(sheetKey);

  if (cached) {
    return dedupeRowsById(sheetKey, cached.rows as SheetRow<T>[]);
  }

  const diskCached = await readDiskCachedRows<T>(sheetKey);
  return diskCached ? dedupeRowsById(sheetKey, diskCached) : [];
}

export async function appendSheetRow(sheetKey: SheetKey, data: RowData) {
  const sheets = await getSheetsClient();
  const spreadsheetId = getRequiredEnv("GOOGLE_SHEETS_ID");
  await assertSheetHeader(sheets, sheetKey);

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetKey}!A1`,
    insertDataOption: "INSERT_ROWS",
    valueInputOption: "RAW",
    requestBody: {
      values: [toRowValues(sheetKey, data)]
    }
  });
  await appendCachedRow(sheetKey, data);
}

export async function updateSheetRow(sheetKey: SheetKey, rowNumber: number, data: RowData) {
  const sheets = await getSheetsClient();
  const spreadsheetId = getRequiredEnv("GOOGLE_SHEETS_ID");
  const columnCount = sheetSchemas[sheetKey].length;
  const endColumn = columnName(columnCount);
  await assertSheetHeader(sheets, sheetKey);

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetKey}!A${rowNumber}:${endColumn}${rowNumber}`,
    valueInputOption: "RAW",
    requestBody: {
      values: [toRowValues(sheetKey, data)]
    }
  });
  await updateCachedRow(sheetKey, rowNumber, data);
}

export async function deleteSheetRow(sheetKey: SheetKey, rowNumber: number) {
  const sheets = await getSheetsClient();
  const spreadsheetId = getRequiredEnv("GOOGLE_SHEETS_ID");
  await assertSheetHeader(sheets, sheetKey);
  const sheetId = await getSheetId(sheetKey);

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
              endIndex: rowNumber
            }
          }
        }
      ]
    }
  });
  await deleteCachedRow(sheetKey, rowNumber);
}

export async function updateSheetRowById(
  sheetKey: "companies" | "events" | "settings",
  idColumn: "company_id" | "event_id" | "setting_id",
  id: string,
  data: RowData
) {
  const row = await findSheetRow<Record<string, string>>(
    sheetKey,
    (candidate) => candidate[idColumn] === id,
    `${idColumn} "${id}"`,
    { fresh: true }
  );

  if (row[idColumn] !== id) {
    throw new Error(`ID mismatch before update in "${sheetKey}". Expected "${id}", got "${row[idColumn]}"`);
  }

  await assertRowColumnValue(sheetKey, row._rowNumber, idColumn, id);
  await updateSheetRow(sheetKey, row._rowNumber, data);
}

export async function deleteSheetRowById(
  sheetKey: "companies" | "events" | "settings",
  idColumn: "company_id" | "event_id" | "setting_id",
  id: string
) {
  const row = await findSheetRow<Record<string, string>>(
    sheetKey,
    (candidate) => candidate[idColumn] === id,
    `${idColumn} "${id}"`,
    { fresh: true }
  );

  if (row[idColumn] !== id) {
    throw new Error(`ID mismatch before delete in "${sheetKey}". Expected "${id}", got "${row[idColumn]}"`);
  }

  await assertRowColumnValue(sheetKey, row._rowNumber, idColumn, id);
  await deleteSheetRow(sheetKey, row._rowNumber);
}

export async function updateMatchedSheetRow<T>(
  sheetKey: SheetKey,
  matcher: RowMatcher<T>,
  description: string,
  data: RowData
) {
  const row = await findSheetRow<T>(sheetKey, matcher, description);
  await updateSheetRow(sheetKey, row._rowNumber, data);
}

export async function deleteMatchedSheetRow<T>(
  sheetKey: SheetKey,
  matcher: RowMatcher<T>,
  description: string
) {
  const row = await findSheetRow<T>(sheetKey, matcher, description);
  await deleteSheetRow(sheetKey, row._rowNumber);
}

export async function findSheetRow<T>(
  sheetKey: SheetKey,
  matcher: RowMatcher<T>,
  description: string,
  options: ListOptions = {}
) {
  const rows = await listSheetRows<T>(sheetKey, options);
  const matches = rows.filter(matcher);
  const row = matches[0];

  if (!row) {
    throw new Error(`No row found in "${sheetKey}" for ${description}`);
  }

  if (matches.length > 1) {
    throw new Error(`Multiple rows found in "${sheetKey}" for ${description}`);
  }

  return row;
}

async function getSheetId(sheetKey: SheetKey) {
  const sheets = await getSheetsClient();
  const spreadsheetId = getRequiredEnv("GOOGLE_SHEETS_ID");
  const response = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties"
  });

  const sheet = response.data.sheets?.find((candidate: sheets_v4.Schema$Sheet) => candidate.properties?.title === sheetKey);
  const sheetId = sheet?.properties?.sheetId;

  if (sheetId === undefined || sheetId === null) {
    throw new Error(`Sheet "${sheetKey}" was not found`);
  }

  return sheetId;
}

async function assertRowColumnValue(sheetKey: SheetKey, rowNumber: number, column: string, expectedValue: string) {
  const columnIndex = (expectedColumns(sheetKey) as readonly string[]).indexOf(column);

  if (columnIndex < 0) {
    throw new Error(`Column "${column}" was not found in schema "${sheetKey}"`);
  }

  const sheets = await getSheetsClient();
  const spreadsheetId = getRequiredEnv("GOOGLE_SHEETS_ID");
  await assertSheetHeader(sheets, sheetKey);
  const columnLabel = columnName(columnIndex + 1);
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetKey}!${columnLabel}${rowNumber}:${columnLabel}${rowNumber}`
  });
  const actualValue = String(response.data.values?.[0]?.[0] ?? "");

  if (actualValue !== expectedValue) {
    throw new Error(
      `ID mismatch before writing "${sheetKey}" row ${rowNumber}. Expected "${expectedValue}", got "${actualValue}"`
    );
  }
}

function columnName(columnNumber: number) {
  let number = columnNumber;
  let name = "";

  while (number > 0) {
    const remainder = (number - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    number = Math.floor((number - 1) / 26);
  }

  return name;
}

async function readDiskCachedRows<T>(sheetKey: SheetKey) {
  try {
    const cache = await readDiskCache();
    const cached = cache[sheetKey];

    if (!cached || !cacheActive(cached.expiresAt)) {
      return null;
    }

    return cached.rows as SheetRow<T>[];
  } catch {
    return null;
  }
}

async function readDiskCache(): Promise<DiskCache> {
  try {
    const raw = await fs.readFile(cacheFile, "utf8");
    return JSON.parse(raw) as DiskCache;
  } catch {
    return {};
  }
}

async function writeDiskCache(cache: DiskCache) {
  await fs.mkdir(cacheDir, { recursive: true });
  await fs.writeFile(cacheFile, JSON.stringify(cache), "utf8");
}

async function updateDiskCache(sheetKey: SheetKey, rows: SheetRow<unknown>[], ttl = rowCacheTtlMs) {
  const cache = await readDiskCache();
  cache[sheetKey] = {
    expiresAt: Date.now() + ttl,
    rows
  };
  await writeDiskCache(cache);
}

async function appendCachedRow(sheetKey: SheetKey, data: RowData) {
  const cachedRows = await getCachedRowsForMutation(sheetKey);
  const nextRowNumber = Math.max(1, ...cachedRows.map((row) => row._rowNumber)) + 1;
  const nextRows = [
    ...cachedRows,
    rowValuesToObject<unknown>(sheetKey, toRowValues(sheetKey, data), nextRowNumber)
  ];
  setRowsCache(sheetKey, nextRows);
  await updateDiskCache(sheetKey, nextRows, diskCacheTtlMs);
}

async function updateCachedRow(sheetKey: SheetKey, rowNumber: number, data: RowData) {
  const cachedRows = await getCachedRowsForMutation(sheetKey);
  const nextRows = cachedRows.map((row) =>
    row._rowNumber === rowNumber
      ? rowValuesToObject<unknown>(sheetKey, toRowValues(sheetKey, data), rowNumber)
      : row
  );
  setRowsCache(sheetKey, nextRows);
  await updateDiskCache(sheetKey, nextRows, diskCacheTtlMs);
}

async function deleteCachedRow(sheetKey: SheetKey, rowNumber: number) {
  const cachedRows = await getCachedRowsForMutation(sheetKey);
  const nextRows = cachedRows
    .filter((row) => row._rowNumber !== rowNumber)
    .map((row) => row._rowNumber > rowNumber ? { ...row, _rowNumber: row._rowNumber - 1 } : row);
  setRowsCache(sheetKey, nextRows);
  await updateDiskCache(sheetKey, nextRows, diskCacheTtlMs);
}

async function getCachedRowsForMutation(sheetKey: SheetKey) {
  const memoryRows = rowsCache.get(sheetKey)?.rows;
  if (memoryRows) return memoryRows;

  const diskRows = await readDiskCachedRows<unknown>(sheetKey);
  return diskRows ?? [];
}

function setRowsCache(sheetKey: SheetKey, rows: SheetRow<unknown>[]) {
  rowsCache.set(sheetKey, {
    expiresAt: Date.now() + rowCacheTtlMs,
    rows
  });
}
