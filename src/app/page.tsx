import { HomeClient } from "@/components/home-client";
import { listSheetRows, readCachedSheetRows, type SheetRow } from "@/lib/google-sheets";
import type { Company } from "@/types/company";
import type { JobEvent } from "@/types/event";
import type { Setting } from "@/types/settings";

export const dynamic = "force-dynamic";

type PageData = {
  companies: SheetRow<Company>[];
  events: SheetRow<JobEvent>[];
  settings: SheetRow<Setting>[];
  error: string | null;
};

type HomeProps = {
  searchParams?: Promise<{
    actionError?: string;
    view?: string;
    month?: string;
    _refresh?: string;
  }>;
};

async function getPageData(options: { fresh?: boolean } = {}): Promise<PageData> {
  try {
    const [companies, events, settings] = await Promise.all([
      options.fresh ? listSheetRows<Company>("companies", options) : readCachedSheetRows<Company>("companies"),
      options.fresh ? listSheetRows<JobEvent>("events", options) : readCachedSheetRows<JobEvent>("events"),
      options.fresh ? listSheetRows<Setting>("settings", options) : readCachedSheetRows<Setting>("settings")
    ]);

    return { companies, events, settings, error: null };
  } catch (error) {
    return {
      companies: [],
      events: [],
      settings: [],
      error: error instanceof Error ? error.message : "Google Sheets connection failed"
    };
  }
}

export default async function Home({ searchParams }: HomeProps) {
  const params = await searchParams;
  const { companies, events, settings, error } = await getPageData({ fresh: Boolean(params?._refresh) });

  return (
    <HomeClient
      initialView={parseAppView(params?.view)}
      companies={companies}
      events={events}
      settings={settings}
      error={error}
      actionError={params?.actionError}
      monthParam={params?.month}
    />
  );
}

function parseAppView(value: string | undefined) {
  if (value === "calendar" || value === "companies" || value === "stats" || value === "settings") {
    return value;
  }

  return "dashboard";
}
