"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

const primary = [
  { href: "/", label: "Research" },
  { href: "/run", label: "Run everything" },
  { href: "/audit", label: "Audit" },
  { href: "/live", label: "Live Room" },
];

const secondary = [
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

  const isActive = (href: string) => (href === "/" ? path === "/" || path.startsWith("/memo") : path.startsWith(href));

  return (
    <header className="no-print relative z-20 border-b border-rule bg-paper">
      <div className="mx-auto flex h-[68px] max-w-[1240px] items-center justify-between gap-6 px-5 md:px-10">
        <div className="flex items-center gap-4">
          <Link href="/" className="serif text-[1.85rem] leading-none tracking-[-0.03em] text-navy" aria-label="Proven home">
            Proven
          </Link>
          {mock && (
            <span
              title="The server is running with MOCK=1. Results are fixtures, not real research."
              className="rounded-md border border-dig bg-dig-soft px-2 py-0.5 font-mono text-[0.72rem] font-medium uppercase tracking-wider text-dig"
            >
              Demo data
            </span>
          )}
        </div>
        <nav className="flex shrink-0 items-center whitespace-nowrap" aria-label="Main">
          <div className="flex items-center gap-1">
            {primary.map((l) => {
              const active = isActive(l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  className={`relative px-3 py-2 text-[0.94rem] font-medium transition-colors ${
                    active ? "text-ink" : "text-graphite hover:text-cobalt"
                  }`}
                >
                  {l.label}
                  {active && <span className="absolute inset-x-3 -bottom-[15px] h-[2px] bg-ink" />}
                </Link>
              );
            })}
          </div>
          <span className="mx-3 h-5 w-px bg-rule" aria-hidden />
          <div className="flex items-center gap-0.5">
            {secondary.map((l) => {
              const active = isActive(l.href);
              return (
                <Link
                  key={l.href}
                  href={l.href}
                  aria-current={active ? "page" : undefined}
                  className={`relative px-2.5 py-2 font-mono text-[0.78rem] transition-colors ${
                    active ? "text-ink" : "text-graphite/85 hover:text-cobalt"
                  }`}
                >
                  {l.label}
                  {active && <span className="absolute inset-x-2.5 -bottom-[15px] h-[2px] bg-ink" />}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </header>
  );
}
