import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Nav from "@/components/Nav";
import { isMock } from "@/lib/mock";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Proven",
  description: "Research companies, vendors, and markets with cited memos and live claim checks.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}>
        <Nav />
        <main className="mx-auto w-full max-w-5xl px-5 pb-20 pt-8 sm:px-6 sm:pt-10">
          {isMock() && (
            <p className="mb-6 rounded-lg border border-line bg-soft px-4 py-2 text-sm text-muted">
              Demo mode · Memos and claim checks use sample evidence for Acme Robotics.
            </p>
          )}
          {children}
        </main>
      </body>
    </html>
  );
}
