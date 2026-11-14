import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Proven — AI Due Diligence", template: "%s | Proven" },
  description: "Research startups, vendors, and markets with traceable evidence.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="header-inner">
            <Link className="wordmark" href="/">proven<span>.</span></Link>
            <nav aria-label="Main">
              <Link href="/">Diligence</Link>
              <Link href="/live">Live Room</Link>
            </nav>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
