"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
export default function Nav() {
  const path = usePathname();
  return <header className="app-nav"><div className="nav-inner">
    <Link href="/" className="brand" aria-label="Proven home"><span className="brand-mark" aria-hidden="true">p</span>proven<span className="brand-dot">.</span></Link>
    <nav aria-label="Main navigation" className="nav-tabs">
      {[{ href: "/", label: "Research" }, { href: "/live", label: "Live Room" }].map(link =>
        <Link key={link.href} href={link.href} aria-current={path === link.href ? "page" : undefined} className={path === link.href ? "nav-tab active" : "nav-tab"}>
          {link.href === "/live" && <span className="live-dot" aria-hidden="true" />}{link.label}
        </Link>)}
    </nav><span className="nav-caption">Clarity. With receipts.</span>
  </div></header>;
}
