import { google } from "googleapis";

import { sheetSchemas, type SheetKey } from "@/lib/schema";

export type SheetRow<T> = T & {
  _rowNumber: number;
};

type SheetValue = string | number | boolean;
type RowData = Record<string, SheetValue>;

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
  const credentials = getServiceAccountCredentials();
  const auth = new google.auth.JWT({
    email: credentials.clientEmail,
    key: credentials.privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"]
  });

  return google.sheets({ version: "v4", auth });
}

function toRowValues(sheetKey: SheetKey, data: RowData) {
  return sheetSchemas[sheetKey].map((column) => {
    const value = data[column];
    return value === undefined || value === null ? "" : String(value);
  });
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

export async function listSheetRows<T>(sheetKey: SheetKey): Promise<SheetRow<T>[]> {
  const sheets = await getSheetsClient();
  const spreadsheetId = getRequiredEnv("GOOGLE_SHEETS_ID");
  const range = `${sheetKey}!A:Z`;
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range
  });

  const rows = response.data.values ?? [];

  return rows.slice(1).map((row, index) => rowValuesToObject<T>(sheetKey, row, index + 2));
}

export async function appendSheetRow(sheetKey: SheetKey, data: RowData) {
  const sheets = await getSheetsClient();
  const spreadsheetId = getRequiredEnv("GOOGLE_SHEETS_ID");

  await sheets.spreadsheets.values.append({
    spreadsheetId,
    range: `${sheetKey}!A:Z`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [toRowValues(sheetKey, data)]
    }
  });
}

export async function updateSheetRow(sheetKey: SheetKey, rowNumber: number, data: RowData) {
  const sheets = await getSheetsClient();
  const spreadsheetId = getRequiredEnv("GOOGLE_SHEETS_ID");
  const columnCount = sheetSchemas[sheetKey].length;
  const endColumn = columnName(columnCount);

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${sheetKey}!A${rowNumber}:${endColumn}${rowNumber}`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: [toRowValues(sheetKey, data)]
    }
  });
}

export async function deleteSheetRow(sheetKey: SheetKey, rowNumber: number) {
  const sheets = await getSheetsClient();
  const spreadsheetId = getRequiredEnv("GOOGLE_SHEETS_ID");
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
}

async function getSheetId(sheetKey: SheetKey) {
  const sheets = await getSheetsClient();
  const spreadsheetId = getRequiredEnv("GOOGLE_SHEETS_ID");
  const response = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties"
  });

  const sheet = response.data.sheets?.find((candidate) => candidate.properties?.title === sheetKey);
  const sheetId = sheet?.properties?.sheetId;

  if (sheetId === undefined || sheetId === null) {
    throw new Error(`Sheet "${sheetKey}" was not found`);
  }

  return sheetId;
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
