import { NextResponse } from "next/server";

import { listSheetRows, readCachedSheetRows } from "@/lib/google-sheets";
import type { Company } from "@/types/company";
import type { JobEvent } from "@/types/event";
import type { Setting } from "@/types/settings";

export async function GET(request: Request) {
  try {
    const fresh = new URL(request.url).searchParams.get("fresh") === "1";
    const [companies, events, settings] = await Promise.all([
      fresh ? listSheetRows<Company>("companies", { fresh: true }) : readCachedSheetRows<Company>("companies"),
      fresh ? listSheetRows<JobEvent>("events", { fresh: true }) : readCachedSheetRows<JobEvent>("events"),
      fresh ? listSheetRows<Setting>("settings", { fresh: true }) : readCachedSheetRows<Setting>("settings")
    ]);

    return NextResponse.json({ companies, events, settings, error: null });
  } catch (error) {
    return NextResponse.json(
      {
        companies: [],
        events: [],
        settings: [],
        error: error instanceof Error ? error.message : "Google Sheets connection failed"
      },
      { status: 500 }
    );
  }
}
