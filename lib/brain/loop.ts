// Research until proven (deep mode): after each search round Claude lists the questions an investor must have
// answered, marks each answered-with-a-source or open, and writes new queries for the open ones only.
// Stops when coverage is high enough, a round brings no new sources, or the time budget runs out.
import type { Round, Source, TrailRecorder } from "../types";
import { searchAll } from "../search";
import { askJSON } from "./claude";

export const MAX_EXTRA_ROUNDS = 3;
export const ENOUGH = 0.85;
const BUDGET_MS = 75_000;
const MIN_ROUND_MS = 20_000; // don't start a search + assessment with less than this left
const MAX_SOURCES = 40;

const strings = { type: "array", items: { type: "string" } };
const assessSchema = {
  type: "object",
  additionalProperties: false,
  required: ["questions", "coverage", "queries", "own_domains", "own_source_ids"],
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["question", "status", "source_ids"],
        properties: {
          question: { type: "string" },
          status: { type: "string", enum: ["answered", "open"] },
          source_ids: strings,
        },
      },
    },
    coverage: { type: "number" },
    queries: strings,
    own_domains: strings,
    own_source_ids: strings,
  },
};
type Assessment = {
  questions: { question: string; status: "answered" | "open"; source_ids: string[] }[];
  coverage: number;
  queries: string[];
  own_domains: string[];
  own_source_ids: string[];
};

const host = (url: string) => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
};

// The company's own source: on one of its domains, or (no domain known) a host whose name is the company's name.
export function isOwn(url: string, company: string, ownDomains: string[] = []): boolean {
  const h = host(url);
  if (!h) return false;
  if (ownDomains.some((d) => h === d || h.endsWith(`.${d}`))) return true;
  const name = company.toLowerCase().replace(/[^a-z0-9]/g, "");
  const labels = h.split(".");
  return name.length > 2 && labels.length >= 2 && labels[labels.length - 2].replace(/-/g, "") === name;
}

export async function researchUntilProven(
  company: string,
  firstQueries: string[],
  first: Source[],
  trail: TrailRecorder,
): Promise<{ sources: Source[]; rounds: Round[]; ownDomains: string[]; ownUrls: Set<string> }> {
  const t0 = Date.now();
  const left = () => BUDGET_MS - (Date.now() - t0);
  let sources = first;
  let queries = firstQueries;
  let added = first.length;
  const rounds: Round[] = [];
  const ownDomains = new Set<string>();
  const ownUrls = new Set<string>();

  for (let round = 1; round <= 1 + MAX_EXTRA_ROUNDS; round++) {
    let ms = 0;
    let a: Assessment;
    try {
      a = await askJSON<Assessment>({
        label: "",
        trail: { id: trail.id, step: (s) => (ms = s.ms) }, // the step is recorded below, once the result is known
        effort: "low",
        maxTokens: 3000,
        system:
          "You judge whether diligence research is complete. List the 6 questions an investor must have answered, one each on: " +
          "revenue or traction, funding and investors, competitors, team, risks or legal trouble, customers. Make each specific to the subject. " +
          "Mark a question answered only when a source below answers it with something concrete, and give those source ids; otherwise open. " +
          "coverage: 0 to 1, how much of what an investor must know is answered with a source. " +
          "queries: 3 to 5 new short search queries aimed ONLY at the open questions, different from the ones already searched, " +
          "preferring independent sources over the company's own site; an empty list when nothing is open. " +
          "own_domains: the subject's own website domains seen in the sources (e.g. acme.com). " +
          "own_source_ids: sources on other sites that are press releases the subject itself issued.",
        user:
          `Subject: ${company}\n\nAlready searched:\n${rounds.flatMap((r) => r.queries).concat(queries).map((q) => `- ${q}`).join("\n")}\n\n` +
          `Sources so far:\n${sources.map((s) => `[${s.id}] ${s.title} (${s.url})\n${s.snippet.slice(0, 300)}`).join("\n")}`,
        schema: assessSchema,
      });
    } catch (e) {
      trail.step({ kind: "llm", label: `Round ${round}: could not judge coverage (${(e as Error).message.slice(0, 80)})`, ms });
      break;
    }

    const ids = new Map(sources.map((s) => [s.id, s]));
    // Answered counts only when the cited source exists.
    const answered = a.questions.filter((q) => q.status === "answered" && q.source_ids.some((id) => ids.has(id)));
    const open = a.questions.filter((q) => !answered.includes(q)).map((q) => q.question);
    const coverage = Math.max(0, Math.min(1, a.coverage));
    a.own_domains.forEach((d) => {
      const h = host(d.includes("://") ? d : `https://${d}`);
      if (h.includes(".")) ownDomains.add(h);
    });
    a.own_source_ids.forEach((id) => ids.has(id) && ownUrls.add(ids.get(id)!.url));
    rounds.push({ round, queries, new_sources: added, coverage, open });

    const next = a.queries.map((q) => q.trim()).filter(Boolean).slice(0, 5);
    const stop =
      coverage >= ENOUGH || open.length === 0
        ? "enough to write the memo"
        : round > MAX_EXTRA_ROUNDS
          ? "round limit reached"
          : next.length === 0
            ? "no further queries"
            : sources.length >= MAX_SOURCES
              ? `${MAX_SOURCES}-source limit reached`
              : left() < MIN_ROUND_MS
                ? "time budget reached"
                : "";
    trail.step({
      kind: "llm",
      label: `Round ${round}: ${answered.length} of ${a.questions.length} key questions answered, ${stop || "searching the gaps"}`,
      ms,
    });
    if (stop) break;

    const more = await Promise.race([
      searchAll(next, trail, { platforms: true }).catch(() => [] as Source[]),
      new Promise<Source[]>((r) => setTimeout(() => r([]), Math.max(0, left() - 10_000)).unref?.()),
    ]);
    const seen = new Set(sources.map((s) => s.url));
    const fresh = more.filter((s) => !seen.has(s.url)).slice(0, MAX_SOURCES - sources.length);
    if (fresh.length === 0) {
      trail.step({ kind: "llm", label: `Round ${round + 1}: no new sources arrived, stopping`, ms: 0 });
      break;
    }
    sources = [...sources, ...fresh].map((s, i) => ({ ...s, id: `s${i + 1}` }));
    queries = next;
    added = fresh.length;
  }
  return { sources, rounds, ownDomains: [...ownDomains], ownUrls };
}
