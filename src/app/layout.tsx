import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { NavBadges } from "./NavBadges";

export const metadata: Metadata = {
  title: "Serenity Tracker",
  description: "Track stock ideas and research",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-bg font-sans antialiased">
        <nav className="border-b border-border bg-surface/80 backdrop-blur sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
            <div className="flex items-center gap-6">
              <Link href="/" className="text-lg font-semibold tracking-tight text-fg">
                Serenity Tracker
              </Link>
              <Link href="/" className="text-sm text-muted hover:text-fg transition">
                Knowledge Base
              </Link>
              <Link href="/agents" className="text-sm text-muted hover:text-fg transition">
                Agents
              </Link>
              <Link href="/tweets" className="text-sm text-muted hover:text-fg transition">
                Tweets
              </Link>
              <Link href="/claims" className="text-sm text-muted hover:text-fg transition">
                Claims
              </Link>
              <Link href="/log" className="text-sm text-muted hover:text-fg transition">
                Log
              </Link>
            </div>
            <div className="flex items-center gap-4">
              <NavBadges />
              <Link
                href="/stocks/new"
                className="bg-accent text-bg text-sm font-medium px-4 py-1.5 rounded hover:bg-accent/90 transition"
              >
                + Add Stock
              </Link>
            </div>
          </div>
        </nav>
        <main className="max-w-7xl mx-auto px-4 py-8">{children}</main>
      </body>
    </html>
  );
}
