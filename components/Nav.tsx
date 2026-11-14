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
        <nav aria-label="Main" className="flex gap-1 sm:gap-2">
          {links.map((l) => {
            const active = path === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`rounded-lg px-2 py-2 sm:px-4 font-medium transition-colors ${
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
