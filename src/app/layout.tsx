import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Job Hunt Note",
  description: "Personal job hunting tracker backed by Google Sheets"
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
