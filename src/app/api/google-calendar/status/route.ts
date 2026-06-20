import { NextResponse } from "next/server";

import { getCalendarConnectionInfo } from "@/lib/google-calendar";

export async function GET() {
  const connection = await getCalendarConnectionInfo();

  return NextResponse.json(connection);
}
