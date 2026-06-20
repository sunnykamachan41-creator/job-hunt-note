import { NextResponse } from "next/server";

import { getCalendarAuthUrl } from "@/lib/google-calendar";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.redirect(getCalendarAuthUrl());
}
