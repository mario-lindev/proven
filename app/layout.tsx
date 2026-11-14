import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter } from "next/font/google";
import Nav from "@/components/Nav";
import "./globals.css";

const sans = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Proven",
  description: "Research memos and live claim checks where every line cites its source.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${mono.variable} antialiased bg-paper text-ink`}>
        <Nav />
        <main className="site-frame pb-16 pt-8 sm:pt-11">{children}</main>
      </body>
    </html>
  );
}
