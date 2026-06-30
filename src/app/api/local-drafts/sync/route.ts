import { NextResponse } from "next/server";

import { syncLocalDrafts } from "@/lib/actions";

export async function POST(request: Request) {
  try {
    const payload = await request.json() as Record<string, unknown>;
    const formData = new FormData();

    formData.set("companies_json", stringifyArray(payload.companies));
    formData.set("events_json", stringifyArray(payload.events));
    formData.set("company_updates_json", stringifyArray(payload.companyUpdates));
    formData.set("event_updates_json", stringifyArray(payload.eventUpdates));
    formData.set("company_deletes_json", stringifyArray(payload.companyDeletes));
    formData.set("event_deletes_json", stringifyArray(payload.eventDeletes));

    const result = await syncLocalDrafts(formData);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Local draft sync failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}

function stringifyArray(value: unknown) {
  return JSON.stringify(Array.isArray(value) ? value : []);
}
