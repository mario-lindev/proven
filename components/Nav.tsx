"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const links = [
  { href: "/", label: "Research" },
  { href: "/run", label: "Run everything" },
  { href: "/live", label: "Live Room" },
  { href: "/audit", label: "Audit" },
  { href: "/impact", label: "Impact" },
  { href: "/telem", label: "Telem" },
  { href: "/engines", label: "Learned" },
  { href: "/simulation", label: "ML Lab" },
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
    <header className="no-print border-b border-rule bg-surface">
      <div className="mx-auto flex max-w-[1240px] items-center justify-between gap-4 px-5 py-4 md:px-10">
        <div className="flex items-center gap-4">
          <Link href="/" className="flex items-baseline gap-3" aria-label="Proven home">
            <span className="serif text-[1.75rem] font-semibold leading-none tracking-tight">Proven</span>
            <span className="hidden whitespace-nowrap text-sm text-graphite xl:inline">Research where every line cites its source</span>
          </Link>
          {mock && (
            <span
              title="The server is running with MOCK=1. Results are fixtures, not real research."
              className="rounded-md border-2 border-dig bg-dig-soft px-2.5 py-0.5 text-sm font-semibold text-dig"
            >
              Demo data
            </span>
          )}
        </div>
        <nav className="flex shrink-0 gap-1 whitespace-nowrap" aria-label="Main">
          {links.map((l) => {
            const active = l.href === "/" ? path === "/" || path.startsWith("/memo") : path.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`relative px-3 py-2 font-medium lg:px-4 transition-colors ${
                  active ? "text-ink" : "text-graphite hover:text-ink"
                }`}
              >
                {l.label}
                {active && <span className="absolute inset-x-3 lg:inset-x-4 -bottom-[17px] h-[2px] bg-ink" />}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
