import { promises as fs } from "fs";
import path from "path";
import { NextResponse } from "next/server";

const cacheFile = path.join(process.cwd(), ".cache", "job-hunt-note", "sheets-cache.json");

export async function GET() {
  try {
    const raw = await fs.readFile(cacheFile, "utf8");
    const cache = JSON.parse(raw) as {
      companies?: { rows?: unknown[] };
      events?: { rows?: unknown[] };
      settings?: { rows?: unknown[] };
    };

    return NextResponse.json({
      companies: dedupeRows(cache.companies?.rows ?? [], "company_id"),
      events: dedupeRows(cache.events?.rows ?? [], "event_id"),
      settings: dedupeRows(cache.settings?.rows ?? [], "setting_id"),
      error: null
    });
  } catch {
    return NextResponse.json({ companies: [], events: [], settings: [], error: null });
  }
}

function dedupeRows(rows: unknown[], idColumn: string) {
  const withoutId: unknown[] = [];
  const byId = new Map<string, unknown>();

  for (const row of rows) {
    if (!row || typeof row !== "object") {
      continue;
    }

    const id = String((row as Record<string, unknown>)[idColumn] ?? "").trim();

    if (!id) {
      withoutId.push(row);
      continue;
    }

    byId.set(id, row);
  }

  return [...withoutId, ...byId.values()];
}
