# Demo script: Proven, 3 minutes

Rishith talks. Mario drives the laptop. Aarav holds the timer and the backup video.

Total 3:00. If we are behind at a checkpoint, skip ahead. Never run over. Names in **bold** are the exact labels on screen.

The order: problem, **Pitch Audit** live, a deep memo with **Claims vs. reality** and the trail, **What Proven learned**, one spoken claim in **Live Room**, business and ask. Watch is not in the live demo (see "Why Watch is cut").

---

## Prep (done by 3:45)

**Run the server on port 3313 with real keys.**

```
npm run dev -- -p 3313
```

Open http://localhost:3313. The deployed copy is https://proven-tan.vercel.app. Demo from localhost, because the warmed memos and the learning board are files in `.data/` on this laptop.

**Warm the deep memo.** It takes too long to run on stage (Builder.ai deep took 101.8 s).

```
npx tsx --env-file=.env.local scripts/warm-cache.ts deep "Builder.ai"
```

It prints the verdict, counts, time and `/memo/<id>`. Open that memo and check four things before you rely on it:
- the verdict box says "N of N lines verified against their sources";
- the **Researched until proven** box is there;
- **Claims vs. reality** is there and has the lender line ($220m of 2024 sales told to lenders, about $55m in the audit) and the "Natasha" line (AI, against about 700 human engineers);
- hovering a fact shows a quote.

Each run is a new search, so a re-run can word things differently. If the new run is weaker, use the earlier one: [FILL: id of the Builder.ai deep memo to show]. Run warm-cache memos at least a minute apart: back to back, X, YouTube and WeChat returned rate-limit errors in 3 of 4 memos.

**Pre-run the audit.** Open **Pitch Audit**, paste [DECIDE: audit URL, rippling.com or ramp.com], press **Audit the claims**, wait for the trust score. Leave that tab open and never reload it: an audit lives in the page only. This is the fallback if the live audit stalls. Our real runs: rippling.com gave 3 hold up, 2 contradicted, 3 unclear, trust score 56, in 23 s. ramp.com gave 5 hold up, 3 unclear, trust score 81, in 23.8 s. Rippling shows red; Ramp shows green and amber only. A new run can differ by a claim or two, so read the numbers off the screen, not from this page.

**Fill the learning board.** **What Proven learned** needs memos behind it. The warm-cache runs do that. Check the page shows a leaderboard, not "Nothing learned yet".

## Before we go on (15 minutes before)

Mario:
- [ ] Server answers on http://localhost:3313.
- [ ] **No "Demo data" badge** next to the Proven logo. If it is there, the server runs with `MOCK=1` and every result is a fixture. Restart with `MOCK=0`. Never present mock data as real.
- [ ] Real Chrome, not Safari and not an embedded or IDE browser. The mic only works in real Chrome.
- [ ] Phone hotspot, not venue Wi-Fi.
- [ ] Warm memos are under **Recent memos** on the home page, the Builder.ai deep memo among them.
- [ ] Tabs, in order: 1 slides on slide 1. 2 **Pitch Audit**, empty, the URL on the clipboard. 3 the finished audit from prep. 4 home page with **Recent memos** visible. 5 the Builder.ai deep memo, drawer closed. 6 **What Proven learned**. 7 **Live Room**, mic already allowed (press **Start listening**, allow, **Stop listening**). 8 backup video paused at 0:00.
- [ ] Browser zoom up so the back row can read it. Do Not Disturb on.
- [ ] Do not say "we have no competitors" into Live Room within 90 seconds of going on. Live Room skips a claim it checked in the last 90 seconds.
- [ ] Do not start a memo in the two minutes before going on. Memos and audits use the same engines, and some of them rate-limit.

Rishith:
- [ ] Know the real times: audit 23 to 24 s for 8 claims; deep memo 101.8 s (so it is pre-warmed); live claim check about 8 s (6.7 to 10.6 s over 9 checks).
- [ ] Know the two Builder.ai lines by heart.

---

## Run sheet

### 0:00 to 0:15. Problem (slides 1 and 2)

**Rishith:** "We're Proven. A founder's website says '50,000 customers' and 'the only platform that does this'. An investor checks that by hand, days later, or never. A chatbot will answer, but you can't show your partners where each sentence came from."

**Mario:** slide 2 at "50,000 customers". At "where each sentence came from", go to tab 2.

### 0:15 to 0:55. Pitch Audit, live

**Mario:** paste the URL, press **Audit the claims**. The blue bar reads "Reading the pitch and picking out the claims that can be checked". Then up to 8 claim cards appear and fill in one by one.

**Rishith** (while it runs): "This is a real startup's website, read right now. Proven pulls out what the company says about itself: customers, funding, 'the only one'. Each claim is searched across Telem's engines and checked against sources the company does not control. The company repeating itself doesn't count."

As cards turn: "Green is **Holds up**. Red is **Contradicted**. Amber is **Unclear**: it won't guess." Mario points at one card's quote and its **Independent** source tag. "That quote is on the independent page word for word. Our code checks that before it shows it."

When the score lands (the line reads "Checked in N s"): "[read the scoreboard line]. Trust score [read it]. A search engine gives you ten links. This gives you a verdict per claim, with the quote."

**If it fails:**
- No claims after 15 s, or an error box: tab 3. "Here is the same audit from a few minutes ago."
- Still checking at 0:50: say "the last ones are still coming in" and move on. Do not wait.
- No red card: say what is on screen. "Nothing contradicted on this one. Amber means independent sources don't settle it."

### 0:55 to 1:50. Deep memo: Claims vs. reality, the quote, the trail

**Mario:** tab 4, click Builder.ai under **Recent memos** (or go to tab 5).

**Rishith:** "The audit takes 20 seconds. This is the deep version: a full memo. We ran this one earlier; it took about 100 seconds. Verdict, facts, risks, questions to ask the founder."

**Mario:** point at "N of N lines verified against their sources" in the verdict box, then at **Researched until proven**.

**Rishith:** "Deep mode doesn't stop after one search. It lists the questions an investor must have answered, searches again for the open ones, and stops when they're covered. Up to three extra rounds. [Read the rounds line off the box.]"

**Mario:** scroll to **Claims vs. reality**.

**Rishith:** "This is the part we built for you. Left: **The company says**. Right: **Independent sources say**. Builder.ai told lenders it had $220 million in 2024 sales. The audit found about $55 million. It sold 'Natasha' as AI. Sources say about 700 human engineers did the work."

**Mario:** hover one fact. A box opens: "Checked against the text of ..." with the quote.

**Rishith:** "Hover any line: the exact quote from the page that backs it. Code checks the quote is really in the page's text. A line with no quote is dropped before you see it."

**Mario:** press **How Proven reached this**. Scroll to a search step.

**Rishith:** "And how it got there. Each query, the **Telem topic** the router gave it, the engines **Telem routed to**, who answered and how fast. A funding query and a hiring query go to different engines. One deep memo used 16 engines through one Telem API, LinkedIn, Reddit and Trustpilot among them."

**Mario:** close the drawer (Escape).

**If it fails:** memo tab lost: tab 4, **Recent memos**, click it again. No **Claims vs. reality** section on the memo: show the hover quote and the trail, and say the Builder.ai lines without pointing. Drawer empty: skip it, go to tab 6.

### 1:50 to 2:15. What Proven learned

**Mario:** tab 6 (**What Proven learned** in the top bar).

**Rishith:** "Proven learns too, but only from what it can prove. After every memo it scores each engine: results returned, results a memo cited, results that backed a verified line. An engine gets credit only when its page holds a quote our code found. That score decides which pages get read first next time. A loop that grades its own answers can learn its own mistakes. This one can't give credit without proof."

Mario points at the top row, the **Verified yield** column, and the "routed by Telem" label.

**If it fails** ("Nothing learned yet" or an error): say the same lines over slide 4. Do not show an empty board.

### 2:15 to 2:40. Live Room, one spoken claim

**Mario:** tab 7, press **Start listening**.

**Rishith** (slow, two sentences, then stop): "Investors spend hours checking pitch claims by hand. And the best part: we have no competitors."

Wait. The blue "Searching the web for the latest claim" bar shows it is working. This exact pair came back red in 6.7 s in our test.

On the red **Contradicted** card: "Same check, while I'm talking. It found real competitors, each with a source."

**Mario:** **Stop listening**.

**If it fails:**
- No words in the transcript after 4 s: type `Proven is an AI tool that checks investor pitch claims live during the meeting. We have no competitors.` in the "Type a claim to check" box and press **Check**. Type both sentences. `We have no competitors` by itself came back amber in our test, because no product was named. With the product named it came back red in 7.6 s.
- No card by 2:35: "It's still searching; the audit you saw is the same check." Move on.
- Amber **Unclear**: "Amber means not enough evidence either way." Move on.

**Alternative for this beat, only if prep showed it working:** the Chrome extension on a Google Meet call. [DECIDE: Live Room or the extension on Meet.] Aarav, as the founder on the call, says one claim; the card appears in the side panel. "It reads the call's captions. No audio leaves the browser."

### 2:40 to 3:00. Business and ask (slides 5 and 6)

**Rishith:** "Funds pay per seat. Companies pay per report for vendor checks. We start with seed funds and accelerators: many pitches, few analysts. And Proven keeps watching a company after the memo, through a Telem monitor. We're Rishith, Aarav and Mario, and we built this today. [DECIDE: the ask, same as slide 6]. Thank you."

**Mario:** slide 5 at "Funds pay", slide 6 at "We're Rishith". Stay on slide 6. Keep tab 5 one click away for questions.

---

## Why Watch is cut from the live demo

In our test the first update showed 45 s after **Check now**, and the agent's batch of changes took about 3 minutes. Nothing would arrive inside a 20-second beat. Watch gets one sentence in the business beat. If a judge asks, open a memo, show **Watch this company** and **Check now**, and say the first update takes about 45 seconds.

## Timing risks (measured)

| Risk | Measured | What we do |
|---|---|---|
| Pitch Audit run | 23 s and 23.8 s for 8 claims | Fits the 40 s beat. Finished audit ready in tab 3. |
| Deep memo | 101.8 s (Builder.ai) | Never run on stage. Open from **Recent memos**. |
| Quick memo | 39.4 s with the verify pass | Not in the demo. Only if a judge asks afterwards. |
| Live claim check | median 8.1 s, 6.7 to 10.6 s | One claim only. Typed fallback ready. |
| Watch update | 45 s to the first, about 3 min for the agent's batch | Cut. Mention only. |
| One slow platform engine | Product Hunt took 15.1 s once and held a search round at 15.8 s | Another reason not to run a memo live. |
| Rate limits | X, YouTube, WeChat returned 429 in 3 of 4 back-to-back memos | No memo runs in the two minutes before the demo. |

## If everything fails

Play the backup video from the start, muted ([LINK: backup video]). Rishith narrates the same script. Say once: "The network is down, so here's the run we recorded at [FILL: time the video was recorded] today." Apologize once only.

## Timing checkpoints (Aarav)

| Time | Should be at | If behind |
|---|---|---|
| 0:15 | **Audit the claims** pressed | Cut the problem lines |
| 0:55 | Opening the Builder.ai memo | Leave the audit, even if two cards are still checking |
| 1:25 | **Claims vs. reality** on screen | Skip the rounds box |
| 1:50 | **What Proven learned** | Skip the trail drawer |
| 2:15 | **Start listening** | Skip Live Room, go to slide 5 |
| 2:40 | Slide 5 | Say only the price line and the ask |
