import { NextRequest, NextResponse } from "next/server";

import { saveCalendarOAuthCode } from "@/lib/google-calendar";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(new URL("/?view=settings&actionError=Google%20Calendar%20code%20is%20missing", request.url));
  }

  try {
    await saveCalendarOAuthCode(code);
    return NextResponse.redirect(new URL("/?view=settings", request.url));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Google Calendar connection failed";
    return NextResponse.redirect(new URL(`/?view=settings&actionError=${encodeURIComponent(message)}`, request.url));
  }
}
