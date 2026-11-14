import type { ReactNode } from "react";

export default function SourceLink({ url, className, children }: {
  url: string;
  className?: string;
  children: ReactNode;
}) {
  let href: string | undefined;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") href = parsed.href;
  } catch {
    // A source title remains readable even when its URL is malformed.
  }
  return href
    ? <a href={href} target="_blank" rel="noopener noreferrer" className={className}>{children}</a>
    : <span className={className}>{children}</span>;
}
