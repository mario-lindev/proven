# Judge Q&A: the hard questions

Judges are early-stage investors. Short, honest answers. If we don't know, say "we haven't measured that yet" and how we would. Never make up a number on stage. Every number below is from a real run today (`docs/QA_REPORT.md`) or from the code.

---

## 1. Isn't this just Perplexity or Google?

They give you an answer or ten links. Proven gives you a verdict per claim, and each one has to pass a check they don't run.

- It starts from the company's own claims. Paste a URL and it pulls out up to 8 things the company says about itself. Nobody typed a question.
- It separates the company's words from everyone else's. The company's site and its press releases don't count as evidence.
- Every quote is checked in code against the text of the page before it is shown. A memo line with no quote is dropped.
- It shows the search: which engines Telem routed each query to, who answered, how fast.
- It reaches LinkedIn, X, Reddit, YouTube, Trustpilot, Product Hunt and WeChat through Telem's platform engines.
- It keeps score of which engines' pages held up, and uses that next time.

One line: "A search engine finds pages. Proven tells you which of the founder's sentences survive them."

## 2. How do you know the quotes are real?

Code checks them, not the model. Claude returns a quote and the id of the source it came from. Our code then looks for that quote in the text of that source: the search text plus the full page we read. It ignores case, spacing and quote-mark style, and nothing else. A quote under 12 characters is rejected. If the quote is not there, it is not shown, and a memo line left with no quote is dropped (`quoteIn` in `lib/brain/verify.ts`).

In Pitch Audit the rule is stricter: the quote must be in an independent source, not the company's own site or a press-release wire.

What this does not prove: that the page itself is right, or that the quote fully backs the line. Claude labels each quote "supports the line" or "partly supports it", and a line is kept on either. On one quick memo we checked by hand, 5 of 13 kept lines had only partial quotes. So say "every line has a quote you can read", not "every line is proven true".

## 3. What stops hallucination overall?

Four layers.
1. Claude only sees the sources we found, and the prompt says to drop any line it can't cite.
2. The output must match a strict JSON schema, so every fact and risk carries source ids.
3. Code removes any citation to an id that doesn't exist and drops any line left without one.
4. The verify pass (question 2).

Before the verify pass existed we checked 66 lines across 4 memos against their sources. In 44, every number in the line is in the cited page's search snippet. In 21, the numbers come from the full page text. One line's year was in no snippet, and it was correct. We read 34 of those lines by hand and found none that contradicted its source. That is a spot check, not an accuracy score. For a score we'd build a test set of claims with known answers.

On the live checks, 10 of 10 verdicts in our QA run were defensible.

## 4. Another team built a recursive self-learning agent on Telem. How is Proven different?

Proven learns too, but only from what it can prove.

A loop that grades its own answers can learn its own mistakes. Proven gives an engine credit only when a page that engine returned holds a quote that backs a memo line, and code found that quote on the page. Per engine it counts results returned, results cited and results that backed a verified line. A full quote counts 1, a partial quote 0.5. The board is at **What Proven learned**.

The score is used: before a memo reads any page, candidates are ordered by Telem's consensus, then the learned score moves a page at most 3 places. The score is smoothed, (backed + 1) / (returned + 10), so a few lucky quotes can't put an engine on top.

It's early. The board has today's memos behind it, not thousands. And learning is not the product. The product is the investor's workflow: audit the pitch, read the memo, see the proof.

## 5. Why is this hard to build without Telem?

- 16 engines answered in one deep memo. That is one API key for us, not 16 integrations.
- Telem's router gives each query a topic and an engine list. We'd have to build that choice ourselves.
- Platform reach: LinkedIn, X, Reddit, YouTube, Trustpilot, Product Hunt, WeChat.
- Per-engine output: name, latency, errors and warnings for every run. The trail is made of it, and so is the learning board. We can only score an engine because Telem tells us which engine found each page.
- Date filters, sessions, page fetch, and monitor agents that find changes.

## 6. What does one run cost?

We know the call counts. We have not measured dollars: Claude token usage isn't recorded in the trail yet, and Telem bills per engine meter. Say: "We know the call counts; we'll read the price off the Anthropic, Telem and Tavily dashboards."

Counted on real runs:

| Run | Claude calls | Telem search calls | Telem engine runs (platform) | Tavily searches | Pages read |
|---|---|---|---|---|---|
| Quick memo, with verify | 6 (plan, write, 4 verify batches) | 3 | 46 (14) | 8 | 4, then 16 for verify |
| Quick memo, before verify | 2 | 3 | 41 to 44 (12 to 13) | 8 | 4 |
| Deep memo, before verify and the round loop | 3 | 5 | 96 to 111 (20 to 24) | 20 | 8 |
| Live check, per claim | 2 (find, judge) | 1 to 2 | 9 to 21 (0) | 2 to 3 | 0 |

From the code, not yet counted on a run:
- **Deep memo today** adds one Claude call per round to judge coverage (up to 4), up to 3 extra search rounds of 3 to 5 queries each, and one verify call per 4 lines (17 lines is 5 calls).
- **Pitch Audit:** 1 Claude call to find the claims, then per claim one search and 1 Claude call to judge. 8 claims is 9 Claude calls.

Telem does not bill empty results.

## 7. How fast is it?

- Pitch Audit: 23 s and 23.8 s for 8 claims (two runs).
- Live claim check: median 8.1 s, 6.7 to 10.6 s over 9 checks. Our target was under 6 s. We missed it.
- Quick memo: 39.4 s with the verify pass.
- Deep memo: 101.8 s with the round loop and the verify pass (Builder.ai). 54 to 60 s before those existed.
- Watch: 45 s to the first update, about 3 minutes for the agent's batch.

Writing the memo is about half of a memo's time. The screen shows the elapsed time on every run.

## 8. What's the moat? Anyone can call these APIs.

Today it's small, and we won't pretend otherwise. What builds one:
- **The proof record.** Every memo adds to a count of which engines and sources held up, checked by code. That data is ours and it gets better with use.
- **Workflow.** Audits, memos and trails per company become a fund's research history.
- **Being in the meeting.** Checking a pitch while it is spoken is a habit a report tool doesn't build.

## 9. Who pays, and how much?

Funds per seat, companies per report. [DECIDE: price per seat per month] per seat and [DECIDE: price per report] per report are starting guesses. We haven't tested prices with buyers. A fund pays because a first check that takes an analyst hours takes Proven one run, and the output can go to partners with its quotes.

## 10. Who buys first, and how do you reach them?

Seed funds and accelerators: many first meetings, few analysts. Then corporate development and procurement teams checking vendors. We start founder-led: free audits of companies a fund is looking at this week. We've had [FILL: number of investor or buyer conversations, or "no"] conversations so far. No paying customer or pilot yet.

## 11. Almost every memo says "dig deeper". Is the verdict useful?

Fair. 11 of 12 memos in our history at 1:35 PM said dig deeper, with confidence 0.60 to 0.70. One said pass. None said pursue. The verdict is cautious by design: it only says pursue when sources show strong traction and low risk. The value today is in the lines under it: the facts, the risks and Claims vs. reality. Tuning the verdict needs the accuracy test set.

## 12. What if a founder's claim is true but Proven says Contradicted?

Every card shows the note, the quote and the pages it used. **See the searches behind this** shows the queries. The investor judges, not Proven. Amber **Unclear** is the answer when independent sources don't settle it. In our ramp.com audit, 3 of 8 claims came back unclear, not contradicted.

## 13. What if Telem goes down or raises prices?

Every query also goes to Tavily in parallel. If every Telem call fails, the memo still runs on Tavily results and the trail shows the Telem error. Without Telem we'd lose routing, platform reach, monitors and the per-engine learning, so the product gets weaker but still works.

## 14. Privacy. You're listening to pitches and auditing companies.

We only research companies and public information, never private individuals. All sources are public web pages. We don't log in to any site.

Proven never receives audio. Live Room uses Chrome's speech recognition; the extension reads the call's captions and sends only caption text. Memos and trails are saved as files on our server so share links work. There is no user database.

For real use, the founder should know checks are on, and a fund needs settings for what is kept and for how long. We haven't had a legal review. We would before selling.

## 15. What doesn't work yet?

Say it before they find it.
- Live checks take about 8 s, not under 6.
- A kept line can rest on a partial quote.
- The memo summary is not checked by the verify pass.
- Watch updates take 45 s or more, and watches are lost on a server restart.
- X, YouTube and WeChat rate-limit when memos run back to back.
