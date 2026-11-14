"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const links = [
  { href: "/", label: "Research" },
  { href: "/live", label: "Live Room" },
];

export default function Nav() {
  const path = usePathname();
  const [mock, setMock] = useState(false);

  useEffect(() => {
    fetch("/api/health", { cache: "no-store" })
      .then((r) => r.json())
      .then((h: { mock?: boolean }) => setMock(!!h.mock))
      .catch(() => {});
  }, []);

  return (
    <header className="no-print border-b border-rule-soft bg-paper">
      <div className="site-frame flex min-h-[3.8rem] flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2">
        <Link href="/" className="inline-flex min-h-10 items-center gap-2.5" aria-label="Proven home">
          <svg aria-hidden="true" className="size-7 rounded-md border border-rule bg-raised p-1 text-ink" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 4h7l3 3v13H7z" />
            <path d="m9.5 12.5 1.8 1.8 3.4-4" />
          </svg>
          <span className="text-lg font-semibold leading-none tracking-[-0.03em]">Proven</span>
        </Link>
        <nav className="ml-auto flex items-center gap-1" aria-label="Main">
          {links.map((l) => {
            const active = l.href === "/" ? path === "/" || path.startsWith("/memo") : path.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex min-h-10 items-center whitespace-nowrap rounded-md px-2.5 text-sm font-medium transition-colors sm:px-4 ${
                  active ? "bg-raised text-ink" : "text-graphite hover:bg-raised hover:text-ink"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        {mock && (
          <span
            title="The server is running with MOCK=1 and returning sample data."
            className="order-last basis-full text-xs font-medium text-dig sm:order-none sm:basis-auto sm:rounded-md sm:border sm:border-rule sm:px-2 sm:py-1"
          >
            Demo data
          </span>
        )}
      </div>
    </header>
  );
}
