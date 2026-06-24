import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Serenity Tracker",
  description: "Track stock ideas and research",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-bg font-sans antialiased">
        <nav className="border-b border-border bg-surface/80 backdrop-blur sticky top-0 z-50">
          <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
            <div className="flex items-center gap-6">
              <a href="/" className="text-lg font-semibold tracking-tight text-fg">
                Serenity Tracker
              </a>
              <a href="/tweets" className="text-sm text-muted hover:text-fg transition">
                Tweets
              </a>
              <a href="/claims" className="text-sm text-muted hover:text-fg transition">
                Claims
              </a>
              <a href="/concepts" className="text-sm text-muted hover:text-fg transition">
                Concepts
              </a>
            </div>
            <a
              href="/stocks/new"
              className="bg-accent text-bg text-sm font-medium px-4 py-1.5 rounded hover:bg-accent/90 transition"
            >
              + Add Stock
            </a>
          </div>
        </nav>
        <main className="max-w-6xl mx-auto px-4 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
