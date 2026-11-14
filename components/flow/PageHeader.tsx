// Shared header for the flow pages: serif H1, one-sentence lede, optional ASCII band beneath.
export default function PageHeader({ title, lede, children }: { title: string; lede: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="border-b border-rule pb-8">
      <h1 className="serif max-w-[56rem] text-[4rem] font-semibold leading-[0.98] tracking-[-0.02em] text-ink">{title}</h1>
      <p className="mt-5 max-w-[44rem] text-[1.2rem] leading-relaxed text-graphite">{lede}</p>
      {children && <div className="mt-8">{children}</div>}
    </header>
  );
}
