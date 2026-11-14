# Judge Q&A: the hard questions

Judges are early-stage investors. Short, honest answers. If we don't know, say "we haven't measured that yet" and how we would. Never make up a number on stage.

---

## 1. How do you know it's accurate? What stops hallucination?

Three layers. Claude only sees the sources we found, and the prompt says to use only those and to drop any line it can't cite. The output has to match a strict JSON schema, so every fact and risk carries source ids. Then code removes any citation to an id that doesn't exist and drops any line left without one, before it reaches the screen.

On the retrieval side, pages that several engines found rank first, so one engine's odd result doesn't lead the memo.

What it doesn't do yet: check that the cited page says what the line says. Claude can still misread a source. That's why every line is one click from its page and its search. A second pass that checks each line against its source text is next.

We spot-checked [MEASURE: lines checked by hand] lines across [MEASURE: memos checked] memos; [MEASURE: lines that matched their source] matched. If we didn't do this: "We haven't measured accuracy yet. We'd build a test set of claims with known answers."

## 2. Why not ChatGPT or Perplexity?

They answer a question. Proven does a job: a verdict, facts, risks and questions to ask, where every line has a source and a trail down to which engine answered which query. Uncited lines are removed by code. It reaches LinkedIn, TikTok, X and Trustpilot through Telem's platform engines. It checks a pitch during the meeting, on a Meet or Zoom call. And Watch keeps tracking the company. You could get parts of this from a chat tool, one question at a time, with no record.

## 3. What's the moat? Anyone can call these APIs.

Today it's small, and we won't pretend otherwise. What builds one:
- **Workflow.** Memos, trails and watches per company become a fund's research history.
- **Feedback data.** When users mark a line right or wrong, we learn which engines are reliable for which question. Telem's per-engine output makes that measurable. That data is ours.
- **The live check.** Being in the meeting, on the call, is a habit a report tool doesn't build.

## 4. Why is this hard to build without Telem?

Per-query engine routing, a cross-engine merge, platform access (LinkedIn, TikTok, X, Trustpilot, WeChat), date filters, per-engine latency and errors, one session per task, and monitor agents that find changes. Each is a separate integration or system. Telem gives them through one API, and its per-engine output is what our trail is made of.

## 5. What if Telem goes down or raises prices?

Every query also goes to Tavily in parallel. If every Telem call fails, the memo still runs on Tavily results and the trail shows the Telem error; our offline tests cover that case (`scripts/check-parse.ts`). All provider code is in `lib/search/` behind a few functions. Without Telem we'd lose routing, platform reach and monitors, so the memo gets weaker, but the product still works.

## 6. What does one memo cost?

Calls per memo, from the code:
- **Quick:** 2 Claude calls (plan, write). Up to 3 Telem search calls (general, news, platforms). 6 to 8 Tavily searches. One Tavily extract of 4 pages, with Telem fetch only for pages Tavily missed.
- **Deep:** 3 Claude calls (plan, find gaps, write). Two rounds of up to 3 Telem search calls each. 14 to 20 Tavily searches. One extract of 8 pages.
- **Live claim check:** 1 Claude call to find claims, then per claim (at most 2): up to 2 Telem search calls, 2 to 3 Tavily searches, 1 Claude call to judge.

Telem bills per engine that runs, and platform engines have their own meters.

Measured: quick [MEASURE: dollars per quick memo], deep [MEASURE: dollars per deep memo], live check [MEASURE: dollars per live claim check] (read the Anthropic, Telem and Tavily usage pages before and after one run). If we don't have it: "We haven't measured it yet; we'll read it off the usage dashboards."

## 7. How fast is it?

Quick memo [MEASURE: seconds per quick memo], deep memo [MEASURE: seconds per deep memo], live claim check [MEASURE: seconds per live claim check]. The screen shows the elapsed time on every run, so these come from real runs.

## 8. Who pays, and how much?

Funds per seat, companies per report. [DECIDE: price per seat per month] per seat and [DECIDE: price per report] per report are starting guesses; we haven't tested prices with buyers. A fund pays because a first-pass check that takes an analyst hours takes Proven one run ([MEASURE: seconds per deep memo] for a deep memo), and the output can go to partners with its sources.

## 9. Who buys first, and how do you reach them?

Seed funds and accelerators: many first meetings, few analysts. Then corporate development and procurement teams checking vendors, per report. We start founder-led: free memos on companies a fund is actually looking at, and the trail sells it. We've had [VALIDATE: number of investor or buyer conversations, or say "none yet"] conversations so far. No paying customer or pilot yet.

## 10. Privacy. You're listening to pitches.

We only research companies and public information, never private individuals. All sources are public web pages found through Telem and Tavily; we don't log in to any site.

Proven never receives audio. Live Room uses Chrome's speech recognition, which may run on Google's servers; the extension reads the call's captions and sends only caption text. We send the last two sentences to our server; the claim goes to Claude and short queries go to Telem and Tavily. Memos and trails are saved as files on our server so share links work; there is no user database.

For real use: the founder should know checks are on, and a fund needs settings for what is kept and for how long. We haven't had a legal review yet; we would before selling, especially for platform data and retention.

## 11. What if a founder's claim is true but Proven says Contradicted?

Every card shows the note and the pages it used, and **See the searches behind this** shows the queries. The investor judges, not Proven. Amber **Unclear** is the default when evidence is thin; it won't guess. We'd track overturned verdicts as part of the accuracy test set.
