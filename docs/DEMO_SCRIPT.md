# Demo script: Proven, 3 minutes

Rishith talks. Mario drives the laptop. Aarav holds the timer and the backup video.

Total 3:00. If we are behind at a checkpoint, skip ahead. Never run over. Button names below are the exact labels on screen.

---

## Prep (by 3:45)

**Warm the cache.** With real keys and `MOCK=0`, run deep memos for the demo companies so they show under **Recent memos** on the home page:

```
npx tsx --env-file=.env.local scripts/warm-cache.ts deep [FILL: demo company 1] [FILL: demo company 2] [FILL: demo company 3]
```

Each line prints the verdict, counts, the time it took and `/memo/<id>`. Memos and their trails are saved in `.data/`, so they survive a server restart. Note the times: they are the real memo times for the slides.

**Start the watch early.** Open the memo for [FILL: watched company], press **Watch this company**, then **Check now** once. Leave that tab open and never reload it: the watch lives in the page and in server memory, so a reload or a server restart loses it from the screen (the Telem monitor itself keeps running).

## Before we go on (15 minutes before)

Mario:
- [ ] Chrome, not Safari. Live Room needs Chrome speech recognition.
- [ ] Phone hotspot, not venue Wi-Fi.
- [ ] **No "Demo data" badge** next to the Proven logo. If it is there, the server runs with `MOCK=1` and every result is a fixture: restart with `MOCK=0`. Never present mock data as real.
- [ ] Tabs: 1 slides on slide 1. 2 Proven home, idle, with **Recent memos** visible. 3 Live Room, mic already allowed (press **Start listening**, allow, **Stop listening**). 4 a warmed deep memo for [FILL: demo company 1], drawer closed. 5 the memo tab with the watch running (see Prep). 6 backup video paused at 0:00.
- [ ] Browser zoom up so the back row can read it. Do Not Disturb on.
- [ ] Warm the server: type one claim in Live Room ("Our market is $10B"), press **Check**.
- [ ] Do not say "we have no competitors" within 90 seconds of going on. Live Room skips a claim it checked in the last 90 seconds.
- [ ] Optional extension beat: Proven loaded in Chrome, a Meet call open with Aarav joined from his laptop, captions on (**CC**), the Proven side panel showing **Listening to Google Meet captions** with a green dot.

Rishith:
- [ ] Know the warm-cache times for a deep memo: [MEASURE: seconds per deep memo]. Know one live check time: [MEASURE: seconds per live claim check].
- [ ] Fallback company if no judge names one: [FILL: demo company 1].

---

## Run sheet

### 0:00 to 0:15. Title and problem (slides 1 and 2)

**Rishith:** "We're Proven. Investors hear dozens of pitches a week. Founders say 'we have no competitors' or 'we grew 3x'. Someone checks that by hand, days later, or nobody does. A chatbot is fast, but you can't show your partners where each sentence came from."

**Mario:** slide 2 at "dozens of pitches". At "where each sentence came from", go to tab 3 and press **Start listening**.

### 0:15 to 1:00. Live Room (slide 3 is the backdrop if the app fails)

**On screen:** the transcript fills in; claim cards appear newest on top.

**Rishith** (slow, clear sentences, pause after each):
- "Let me pitch you Proven while Proven listens."
- "Investors spend hours checking pitch claims by hand."
- "And the best part: we have no competitors."
- Stop. Wait for the card. The blue "Searching the web for the latest claim" bar shows it is working.
- On the red **Contradicted** card: "Red. While I talked it searched and found real competitors. Each one has a source." Mario points at the sources.

**Mario:** press **Stop listening** once the card is up.

**If it fails:**
- No words in the transcript after 5 s: type `We have no competitors` in the "Type a claim to check" box, press **Check**. Rishith: "Loud room, I'll type it."
- No card after 15 s, or an error: tab 6, play the Live Room part muted ([FILL: Live Room timestamp in backup video]). Rishith narrates.
- Amber **Unclear**: "Amber means not enough evidence either way. It won't guess." Move on.

### Optional 20 s. Extension on a Meet call (only if prep showed the green dot)

Take these 20 s from the Memo beat below (start the memo on a warmed tab instead of a live run).

**Mario:** switch to the Meet tab. Aarav, as the founder, says: "We already have every top-ten bank as a customer."

**Rishith:** "Same check, on a real video call. It reads Meet's captions, no audio leaves the browser." Point at the card in the side panel. "And **Research this company** opens a full memo."

**If it fails:** say nothing about it and go to the memo.

### 1:00 to 1:45. Memo, with Telem routing live

**On screen:** tab 2, Proven home.

**Rishith:** "Name a company. A startup or a vendor you've looked at." No answer in 3 s: "Let's do [FILL: demo company 1]."

**Mario:** type the name, choose **Quick** (1 round), press **Research**.

**Rishith** (over the research feed): "Claude planned the searches: funding, competitors, hiring, reviews, lawsuits, news. Each one goes to Telem. Watch this line: 'Router chose' is Telem picking different engines for each query. Hiring and review queries also go to Telem's platform engines: LinkedIn, TikTok, X, Trustpilot. News queries only keep the last year. The whole memo is one Telem session, that id at the bottom, which you can open in the Telem console."

When the memo appears: "Verdict: [read it]. Every fact and risk has numbered sources. If Claude writes a line without a real source, our code deletes it."

**If it fails or is still running at 1:40:** switch to tab 4. Rishith: "That one is still searching. Here's a deep memo we ran earlier. Deep searches twice: round two goes after what round one couldn't answer." If tab 4 is lost: tab 2, press **New research**, click the company under **Recent memos**.

Judge names a person: "We only research companies and public information, so let's do their company."

### 1:45 to 2:15. Trail

**Mario:** click a source chip on the first risk. The drawer **How Proven reached this** opens at "This search found the cited source".

**Rishith:** "This risk came from this page. Here's the query that found it, the engines Telem's router chose, every engine that answered and how fast, and the Telem session. Every line is provable. That's the name."

**Mario:** click the page link (opens a new tab), come back, **Close**.

**If it fails:** use tab 4 and press **How Proven reached this**. If that fails too, show the trail screenshot on slide 4.

### 2:15 to 2:35. Watch

**Mario:** tab 5. Press **Check now** (it shows "Telem agent is checking" for a few seconds).

**Rishith:** "And Proven keeps watching. This is a Telem monitor with an agent. Check now runs the agent this second instead of waiting an hour. Each change comes with its source."

Only claim an update if one is on screen. If the panel says "No changes yet": "Nothing new since we started it. When something changes, it lands here with its source."

**If it fails:** skip to slide 5.

### 2:35 to 2:50. Business (slide 5)

**Rishith:** "Funds pay per seat. Companies pay per report for vendor checks. Analysts are slow, chat tools can't be audited, data platforms don't check a pitch live. Proven does all three."

### 2:50 to 3:00. Team and ask (slide 6)

**Rishith:** "Rishith, Aarav, Mario. We built this today. [FILL: the ask, same as slide 6]. Thank you."

**Mario:** stay on the slide. Keep tab 4 one click away for trail questions.

---

## If everything fails

Play the backup video from the start, muted. Rishith narrates the same script and skips "name a company". Say once: "The network is down, so here's the run we recorded at [FILL: time the video was recorded] today." Apologize once only.

## Timing checkpoints (Aarav)

| Time | Should be at | If behind |
|---|---|---|
| 0:15 | Live Room listening | Cut the problem lines |
| 1:00 | Typing a company | Skip the judge ask, use tab 4 |
| 1:45 | Opening the trail | Skip the page link |
| 2:15 | Watch | Skip Watch, go to slide 5 |
| 2:50 | Slide 6 | Say only "Thank you" |
