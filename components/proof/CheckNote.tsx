// A claim check's note. Notes may end with ` Source says: "…"`; that ending is shown as its own quote line.
export default function CheckNote({ note, line }: { note: string; line: string }) {
  const m = note.match(/^([\s\S]*?)\s*Source says:\s*[“"]([\s\S]+?)[”"]?\s*$/);
  if (!m) return <p className="mt-2 text-lg leading-snug">{note}</p>;
  return (
    <>
      {m[1] && <p className="mt-2 text-lg leading-snug">{m[1]}</p>}
      <blockquote className={`mt-3 rounded-r-[4px] border-l-[3px] ${line} bg-paper px-4 py-2.5`}>
        <p className="text-sm font-semibold text-graphite">Source says</p>
        <p className="mt-0.5 font-mono text-[0.98rem] leading-[1.6] text-ink">&ldquo;{m[2]}&rdquo;</p>
      </blockquote>
    </>
  );
}
