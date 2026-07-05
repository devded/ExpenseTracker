import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Ledger · Expense Tracker",
  description: "Expense tracker backed by your own Notion workspace.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
