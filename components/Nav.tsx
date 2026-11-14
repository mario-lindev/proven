"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Memo" },
  { href: "/live", label: "Live Room" },
];

export default function Nav() {
  const path = usePathname();
  return (
    <header className="border-b border-line">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <Link href="/" className="text-2xl font-semibold tracking-tight">
          Proven<span className="text-accent">.</span>
        </Link>
        <nav className="flex gap-2">
          {links.map((l) => {
            const active = path === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-lg px-4 py-2 font-medium transition-colors ${
                  active ? "bg-accent-soft text-accent" : "text-muted hover:text-foreground"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
