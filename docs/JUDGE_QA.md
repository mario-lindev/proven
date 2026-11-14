# Judge Q&A: the 10 hardest questions

Short, honest answers. If we don't know, say "we haven't measured that yet" and say how we would. Never make up a number on stage.

---

## 1. How do you know it's accurate? What stops it from hallucinating?

Three layers. Claude only sees the sources we found, and the prompt says to use only those and to leave out any line it cannot cite. The output must match a strict JSON schema, so every fact and risk comes with source ids. Then our code deletes any line whose source ids don't exist, before it reaches the screen.

What it does not do yet: check that the cited page actually says what the line says. The model can still misread a source. That's why every line is clickable: you can check it in one click. A second pass that checks each line against its source text is the next thing we build.

We spot-checked [MEASURE: number of lines checked] lines by hand across [MEASURE: number of memos] memos; [MEASURE: number that matched their source] matched their source. (If we didn't do this, say: "We haven't measured accuracy yet. We'd build a test set of claims with known answers.")

## 2. Why not just use ChatGPT or Perplexity?

A chat assistant answers a question. Proven gives a fixed output an investor can use: a verdict, facts, risks and questions, where every line has a source and you can see the whole research trail, down to which engine answered which query. Lines without sources are removed by code, not by trust. Live Room checks a pitch while you're in the meeting, and Watch keeps tracking the company afterwards. A careful person could get part of this from a chat tool, one question at a time. We do the whole job in one step and leave a record you can audit.

## 3. Where does the data come from? Is it legal?

Only public web pages, found through two search APIs: Telem and Tavily. We don't log in to any site or scrape anything ourselves. Platform coverage like LinkedIn comes through Telem under its terms. We only research companies and public information, never private individuals.

Honest gap: we haven't had a lawyer review this yet. Before we sell to funds we would, especially for platform data and for how long we store it.

## 4. What's your moat? Anyone can call these APIs.

Today, the moat is small, and we won't pretend otherwise. What builds one over time:
- **Workflow.** If funds keep their memos, trails and watches in Proven, the history per company is hard to move.
- **Feedback data.** Every time a user marks a line or claim check right or wrong, we learn which sources and engines are reliable for which questions. That data is ours.
- **The audit trail as a record.** A memo with its full trail can go into an investment committee packet. That's a habit, not a feature.

## 5. How will you price it? Why would a fund pay?

Per seat for funds, per report for companies. [DECIDE: price per seat per month] per seat and [DECIDE: price per report] per report are our starting guesses; we haven't tested prices with buyers yet. A fund pays because a first-pass check that takes an analyst hours takes Proven [MEASURE: seconds per deep memo] seconds, and the output can be shown to partners with sources.

## 6. Who buys first?

Seed and early-stage funds and accelerators that see a lot of pitches with small teams. They feel the problem most: many first meetings, few analysts. Second, corporate development and procurement teams checking vendors, who would buy per report. We have [VALIDATE: number of investors or buyers we have actually talked to, or say "not yet"] conversations so far.

## 7. What if Telem goes down, raises prices, or goes away?

Every search goes to Telem and Tavily in parallel, and all provider code sits in one folder (`lib/search/`) behind four functions. If one engine or provider fails, the trail records the error and the other results still come through. [VERIFY: confirm searchAll still returns Tavily results when Telem errors.]

But we chose Telem on purpose. Batch search with per-query routing, per-engine latency and errors, platform reach, and monitors would take us months to build ourselves. If Telem went away we'd lose speed and coverage, not the product.

## 8. What does one memo cost you?

A quick memo is two Claude calls (plan and write), one Telem batch search with 6 to 8 queries, 6 to 8 Tavily searches, and one extract of 4 pages. A deep memo adds a third Claude call (find the gaps), a second Telem batch with 4 to 6 queries, 4 to 6 more Tavily searches, and extracts 8 pages. Measured cost: quick [MEASURE: cost per quick memo in dollars], deep [MEASURE: cost per deep memo in dollars] (read the Anthropic, Telem and Tavily usage pages before and after one memo). One live claim check is one claim-finding call, one Telem batch with 2 to 3 queries, 2 to 3 Tavily searches and one judging call: [MEASURE: cost per live claim check].

If we don't have the number: "We haven't measured it yet. It's a handful of API calls per memo, and we'll know the exact cost from the usage dashboards."

## 9. What about privacy? You're recording pitches.

We don't record or store audio. Live Room uses Chrome's built-in speech recognition, which sends audio to Google to turn it into text. We send the last two sentences of text to our server. From there, the claim goes to Claude, and short search queries go to Telem and Tavily. Memos and trails live in memory and are gone when the server restarts; there's no database yet.

For real use: the founder in the room should know Live Room is on, and a fund would need settings for what is kept and for how long. A self-hosted speech model would keep audio off third-party servers.

## 10. How do you get your first customers?

Founder-led sales to small funds and accelerators: we run free memos on companies they're actually looking at, and let the trail sell itself. Investors talk to each other, so a few funds that use it can bring more. Events like this one put us in front of investors directly. For companies, we start with startups buying their first vendors, who do this checking by hand today.

What we don't have yet: any paying customer or pilot. Getting [DECIDE: number] pilots is the next step.
