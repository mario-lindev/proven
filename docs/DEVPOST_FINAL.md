# Proven: Devpost answers (paste each section into its box)

## Project name
Proven

## Elevator pitch (tagline)
Ask AI search one question and you get one answer. Diligence is a hundred questions. Proven runs the whole job and backs every line with a quote from the page it cites.

## Inspiration
Investors and buyers hear confident claims all day: "we have no competitors", "we doubled revenue", "trusted by 85,000 businesses". Checking them takes days of reading, so most claims never get checked. We are three students (13, 14 and 16) and we wanted a tool that checks a company the way a careful analyst would, while the pitch is still happening, and shows its proof.

## What it does
Proven tells you whether a startup, vendor or market is worth pursuing, and shows the evidence for every line.

- **Research memo.** Type a company. Proven plans the questions an investor must answer, searches, reads the pages, and writes a one-page memo with a verdict (pursue, dig deeper or pass), facts, risks and questions to ask the founder. In deep mode it keeps searching the open questions for up to three more rounds.
- **Proof on every line.** After writing, Proven checks each line against the text of the pages it cites and finds the exact quote in code. A line with no quote is dropped. Hover any line to see its quote.
- **Claims vs. reality.** The memo sets what the company says about itself against what independent sources say. On Builder.ai it found a 2024 sales forecast of about $220M given to lenders against an audit figure of about $50M.
- **Pitch Audit.** Paste a startup's website. Proven pulls out the claims the company makes about itself and checks each one against sources the company does not control. On rippling.com: 8 claims in 20 seconds, 5 hold up, 2 contradicted, 1 unclear.
- **Live Room and a Chrome extension.** Proven listens to a pitch, or reads the captions on a Google Meet or Zoom call, and checks each factual claim in about 8 seconds.
- **Run everything.** One click runs the pitch audit, a memo and a watch side by side.
- **Watch.** A Telem monitor agent keeps checking a company for news, funding, layoffs and lawsuits.
- **Event Impact.** Name a company and an event. Proven finds comparable past events and what those stocks did next, each figure backed by a quote. It is research, not investment advice.
- **Learning.** Proven scores each search engine by how often its pages end up backing a verified line, and reads pages from the better engines first next time.

## How we built it
- **Telem** is the first layer of every search. For each question it labels the topic (companies, financial filings, people, news) and routes it to the engines that fit. In today's runs Telem routed over 250 questions across 16 engines, including LinkedIn, X, Reddit, YouTube, Trustpilot and Product Hunt. About two thirds of the results that backed a verified line came from engines Telem chose. Pages found by several engines rank higher, news questions are limited to the past year, and Telem monitor agents power Watch.
- **Tavily** runs beside Telem as a direct search and reads the full pages, so lines are checked against page text and not only search snippets.
- **Claude** plans the research, writes the memo, checks each line against its sources and judges live claims, always returning structured JSON.
- **The proof step is code, not a prompt.** The model proposes a quote; our code checks that the quote is really in the page text and drops the line if it is not.
- **The learning loop** records, per engine and per Telem topic, how many results were returned, cited and verified. Follow-up search rounds send an extra Telem search to the engines that proved out, and the planner gets the query phrasings that led to verified lines.
- **Stack:** Next.js and TypeScript, streaming responses so you watch the research happen, a Chrome extension (Manifest V3) for calls, deployed on Vercel.

## Challenges we ran into
- One of Telem's platform engines hung for 45 seconds and stalled every search. We measured each engine, removed the slow one and added Reddit.
- Early memos could cite a source without the source really saying it. That is why we added the quote check in code and made unsupported lines disappear.
- We tested our own pitch: Google's AI Mode answered our Builder.ai example correctly, with quotes. So we stopped claiming "AI search has no receipts" and focused on what it does not do: audit every claim on a company's site, sit in on a call, keep watching, and show which engines found the proof.
- Our self-improve loop scored 16 of 16 on its benchmark from the start, so no rewrite could beat it. We show that result as it is.

## Accomplishments that we're proud of
- A real memo where 19 of 19 lines carry a quote found on the page they cite.
- Finding the Builder.ai contradictions automatically, with sources on both sides.
- A live claim check on a call in about 8 seconds.
- A page that shows exactly what Telem did: every engine, every topic, and the share of proof that came through it.
- Three of us, aged 13, 14 and 16, shipping this in one day.

## What we learned
- Routing matters. Different questions need different engines, and the engines that return the most results are not always the ones whose pages hold up.
- "Grounded" has to be enforced in code. Asking a model to cite sources is not enough.
- Check your own claims before a judge does.

## What's next for Proven
- Harder benchmarks so the self-improve loop has room to improve.
- SEC filings, company data and patents as extra sources through Telem.
- Saved workspaces for funds, with a shared watchlist.
- Pricing: per seat for funds, per report for companies doing vendor checks.

## Built with
telem, tavily, claude, anthropic, next.js, typescript, react, tailwindcss, vercel, chrome-extension

## Try it out
- Live app: https://proven-tan.vercel.app
- How it works: https://proven-tan.vercel.app/how
- A real memo: https://proven-tan.vercel.app/memo/memo_kd83cz6e
- Code: https://github.com/mario-lindev/proven
