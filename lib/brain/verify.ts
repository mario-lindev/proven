// OWNER: verifier. The verify pass: every fact and risk is re-read against the text of the sources it cites.
// Claude returns the exact quote per cited source; code then checks each quote really is in that source's text.
// A line with no quote found (supported or partial) is dropped.
import type { Evidence, Line, Source, TrailRecorder } from "../types";
import { normalizeUrl } from "../search";
import { askJSON } from "./claude";

const MAX_SOURCE_CHARS = 8000; // extract() already caps pages at 8000
const LINES_PER_BATCH = 4;
const MIN_QUOTE_CHARS = 12; // a quote like "Figma" proves nothing

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["lines"],
  properties: {
    lines: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["line", "evidence"],
        properties: {
          line: { type: "integer" },
          evidence: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["source_id", "quote", "verdict"],
              properties: {
                source_id: { type: "string" },
                quote: { type: "string" },
                verdict: { type: "string", enum: ["supported", "partial", "none"] },
              },
            },
          },
        },
      },
    },
  },
};

type Out = { lines: { line: number; evidence: { source_id: string; quote: string; verdict: Evidence["verdict"] | "none" }[] }[] };

// For comparing a quote with page text: case, whitespace, curly quotes, dashes and markdown marks don't count.
export function normalize(s: string): string {
  return s
    .normalize("NFKC")
    .replace(/\]\([^)]*\)/g, "]") // markdown link: keep the text, drop the url
    .replace(/[‘’‚‛′`´]/g, "'")
    .replace(/[“”„‟″]/g, '"')
    .replace(/[‐-―−]/g, "-")
    .replace(/[*_#>[\]|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const trimEnds = (s: string) => s.replace(/^[\s"'.,;:]+|[\s"'.,;:]+$/g, "");

// True if the quote is in the text. A quote joined with "..." must have every piece in the text.
export function quoteIn(quote: string, text: string): boolean {
  const hay = normalize(text);
  const parts = quote.split(/\.{3}|…/).map((p) => trimEnds(normalize(p))).filter(Boolean);
  if (parts.join(" ").length < MIN_QUOTE_CHARS) return false;
  return parts.every((p) => hay.includes(p));
}

export type Verified = { lines: Line[]; checked: number; kept: number; dropped: number; not_found: number; ms: number };

// Returns every input line (same order) with `evidence` set; a line with empty evidence should be dropped.
// Records one `verify` trail step. Throws if a Claude call fails (the step label says why).
export async function verifyLines(
  lines: Line[],
  sources: Source[],
  pages: { url: string; text: string }[],
  trail: TrailRecorder,
): Promise<Verified> {
  const t0 = Date.now();
  const byId = new Map(sources.map((s) => [s.id, s]));
  const pageText = new Map(pages.map((p) => [normalizeUrl(p.url), p.text]));
  const textOf = (s: Source) => (pageText.get(normalizeUrl(s.url)) || s.snippet || "").slice(0, MAX_SOURCE_CHARS);

  const evidence: Evidence[][] = lines.map(() => []);
  let notFound = 0;
  const batches: number[][] = [];
  for (let i = 0; i < lines.length; i += LINES_PER_BATCH) batches.push(lines.slice(i, i + LINES_PER_BATCH).map((_, j) => i + j));

  try {
    await Promise.all(
      batches.map(async (batch, b) => {
        const ids = [...new Set(batch.flatMap((i) => lines[i].source_ids))].filter((id) => byId.has(id));
        const sourceBlock = ids
          .map((id) => {
            const s = byId.get(id)!;
            return `[${id}] ${s.title} (${s.url})\n${textOf(s) || "(no text)"}`;
          })
          .join("\n\n---\n\n");
        const lineBlock = batch.map((i, k) => `${k + 1}. ${lines[i].text} (cites ${lines[i].source_ids.join(", ")})`).join("\n");

        const out = await askJSON<Out>({
          label: `Verify lines ${batch[0] + 1} to ${batch[batch.length - 1] + 1}`,
          trail,
          effort: "low",
          maxTokens: 4000,
          system:
            "You check a diligence memo against its sources. For each numbered line, look at each source it cites " +
            "and copy the words from that source's text that back the line.\n" +
            "- quote: copied character for character from the source text below. No paraphrase, no added, dropped or changed words, " +
            "no joining distant passages. Short: one sentence or clause, under 40 words.\n" +
            "- verdict: supported = the quote backs the line's main claim (names, numbers and dates match); " +
            "partial = it backs part of the line or a weaker version of it; none = this source does not back the line (quote \"\").\n" +
            "Return one entry per line (line = its number) with one evidence item per cited source.",
          user: `Sources:\n${sourceBlock}\n\nLines:\n${lineBlock}`,
          schema,
        });

        for (const r of out.lines) {
          const i = batch[r.line - 1];
          if (i === undefined) continue;
          const cited = new Set(lines[i].source_ids);
          for (const e of r.evidence) {
            if (e.verdict === "none" || !cited.has(e.source_id) || evidence[i].some((x) => x.source_id === e.source_id)) continue;
            const s = byId.get(e.source_id);
            if (!s || !quoteIn(e.quote, textOf(s))) {
              notFound++;
              if (process.env.VERIFY_DEBUG) console.log(`[verify] quote not in ${e.source_id} for line ${i + 1}: "${e.quote}"`);
              continue;
            }
            evidence[i].push({ source_id: e.source_id, quote: trimEnds(e.quote.trim()), verdict: e.verdict });
          }
        }
        if (process.env.VERIFY_DEBUG) console.log(`[verify] batch ${b + 1}/${batches.length} done in ${Date.now() - t0} ms`);
      }),
    );
  } catch (err) {
    trail.step({ kind: "verify", label: `Verify failed, memo left unverified: ${(err as Error).message}`, ms: Date.now() - t0 });
    throw err;
  }

  const out = lines.map((l, i) => ({ ...l, evidence: evidence[i] }));
  const kept = out.filter((l) => l.evidence.length > 0).length;
  const dropped = lines.length - kept;
  const ms = Date.now() - t0;
  if (process.env.VERIFY_DEBUG) out.filter((l) => !l.evidence.length).forEach((l) => console.log(`[verify] dropped: ${l.text}`));
  const urls = [...new Set(out.flatMap((l) => l.evidence.map((e) => byId.get(e.source_id)!.url)))];
  trail.step({
    kind: "verify",
    label:
      `Checked ${lines.length} lines against their sources: ${kept} kept, ${dropped} dropped` +
      (notFound ? ` (${notFound} quote${notFound === 1 ? "" : "s"} not found in the source)` : ""),
    urls,
    ms,
  });
  return { lines: out, checked: lines.length, kept, dropped, not_found: notFound, ms };
}
