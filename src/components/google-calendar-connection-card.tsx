"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { Card, SectionHeader } from "@/components/ui/card";

type CalendarConnectionInfo = {
  connected: boolean;
  email: string;
  calendarId: string;
  calendarName: string;
};

const emptyConnection: CalendarConnectionInfo = {
  connected: false,
  email: "",
  calendarId: "",
  calendarName: "就活"
};

export function GoogleCalendarConnectionCard() {
  const [connection, setConnection] = useState<CalendarConnectionInfo>(emptyConnection);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let active = true;

    fetch("/api/google-calendar/status", { cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("Google Calendar status request failed");
        return response.json() as Promise<CalendarConnectionInfo>;
      })
      .then((nextConnection) => {
        if (!active) return;
        setConnection(nextConnection);
        setStatus("ready");
      })
      .catch(() => {
        if (!active) return;
        setConnection(emptyConnection);
        setStatus("error");
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <Card id="google-calendar">
      <SectionHeader title="Google Calendar" description="アプリから専用サブカレンダー「就活」へ一方向同期します。" />
      <div className="flex flex-col gap-3 border-t border-line p-4 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold text-ink">
            Google Calendar: {status === "loading" ? "確認中" : connection.connected ? "接続済み" : "未接続"}
          </p>
          {connection.connected ? (
            <div className="mt-1 grid gap-1 text-sm text-muted">
              <p>接続アカウント: {connection.email}</p>
              <p>同期先: {connection.calendarName || "就活"}</p>
              <p>表示/非表示はGoogle Calendar側で切り替え可能です。</p>
            </div>
          ) : (
            <p className="mt-1 text-sm text-muted">
              初回接続時に「就活」カレンダーを確認し、存在しない場合は自動作成します。
              {status === "error" ? " 接続状態の確認に失敗しました。" : null}
            </p>
          )}
        </div>
        <Link
          href="/api/google-calendar/connect"
          className="inline-flex h-9 items-center justify-center rounded-lg border border-brand bg-brand px-3 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
        >
          {connection.connected ? "再接続" : "Google Calendarを接続"}
        </Link>
      </div>
    </Card>
  );
}
