# Demo script: Proven, 3 minutes

Rishith talks. Mario drives the laptop. Aarav sits by the laptop with the backup video open and watches the clock.

Total: 3:00. If we are behind at a checkpoint, skip to the next step. Never run over.

---

## Before we go on (15 minutes before)

Mario:
- [ ] Chrome, not Safari. Live Room needs Chrome's Web Speech API.
- [ ] Laptop on the phone hotspot, not venue Wi-Fi. Chrome speech recognition also needs the network.
- [ ] Tab 1: slides, on slide 1. Tab 2: Proven home page. Tab 3: Proven Live Room, mic permission already granted (click Start once, allow, then Stop). Tab 4: a cached memo for [FILL: demo company 1], trail drawer closed. Tab 5: the Watch panel for [FILL: watched company]. Tab 6: the backup video, paused at 0:00.
- [ ] Browser zoom high enough to read from the back of the room. Turn off notifications (Do Not Disturb).
- [ ] `MOCK=0`. Check the app shows real URLs, not `example.com`. Never present mock fixtures as real results.
- [ ] Run one live claim with a different phrasing ("our market is $10B") to warm up the server.
- [ ] Do not say "we have no competitors" into Live Room after the last server restart. `lib/brain/live.ts` remembers every claim it has checked while the server runs and skips repeats, so a rehearsal can block the live demo. If it was said, restart the server and re-run the cached memos (the store is in memory and a restart clears it).
- [ ] Check the 3 cached memos still open: [FILL: demo company 1], [FILL: demo company 2], [FILL: demo company 3].

Rishith:
- [ ] Know the measured numbers by heart: quick memo [MEASURE: seconds per quick memo], deep memo [MEASURE: seconds per deep memo], claim check [MEASURE: seconds per live claim check].
- [ ] Have one judge-proof company ready in case no judge names one: [FILL: demo company 1].

---

## Run sheet

### 0:00 to 0:10. Title (slide 1)

**On screen:** slide 1.

**Rishith:** "We're Proven. We tell investors whether a startup is worth pursuing, and we show the source for every line we write."

**Mario:** switch to slide 2 at "every line we write".

**If it fails:** nothing can fail here. Keep going.

### 0:10 to 0:25. Problem (slide 2)

**On screen:** slide 2.

**Rishith:** "Investors hear dozens of pitches a week. Founders say 'we have no competitors' or 'we grew 3x'. Someone checks that by hand, days later, or nobody does. And a chatbot answer is fast, but you can't show your partners where each sentence came from."

**Mario:** at "where each sentence came from", switch to tab 3 (Live Room) and click **Start listening**. Check the transcript box shows words.

**If it fails:** if the slide does not advance, Rishith keeps talking; the words carry this step.

### 0:25 to 1:25. Live Room (the main moment)

**On screen:** Live Room. The transcript fills in as Rishith talks. Claim cards appear on the right, newest on top.

**Rishith** (speak slowly, finish each sentence clearly, pause after each one):
- "Let me pitch you Proven while Proven listens."
- "Investors spend hours checking pitch claims by hand."
- "And the best part: we have no competitors."
- (Stop. Wait for the card. Do not fill the silence for up to [MEASURE: seconds per live claim check] seconds.)
- When the red card appears: "Red. It searched while I was talking and found real competitors. Here they are, each with a source." Mario hovers the sources on the card.
- "That's not a guess. Every card links to the pages it used."

**Mario:** click **Stop listening** after the red card is up, so later talk does not add cards.

**What should appear:** the transcript, then a red card: the claim "we have no competitors", a one-line note naming competitors, and source chips.

**If it fails:**
- Mic picks up nothing within 5 seconds: Mario clicks into the text box, types `We have no competitors`, presses Enter. Rishith says "The room is loud, so I'll type it" and carries on.
- No card after 15 seconds: Mario switches to the backup video at the Live Room part (timestamp [FILL: Live Room timestamp in backup video]) and plays it muted. Rishith narrates the same lines over the video.
- Card comes back amber instead of red: Rishith says "Amber means it didn't find enough evidence to call it either way. It won't guess." Then move on. Do not argue with the result.
- Card comes back as an error message: same as no card, go to the video.

### 1:25 to 2:10. Memo

**On screen:** Proven home page (tab 2), then the memo building, then the memo.

**Rishith:** "Now a full memo. Can one of you name a company? A startup or a vendor you've looked at."
- If no judge answers in 3 seconds: "Let's do [FILL: demo company 1]."

**Mario:** set depth to **quick** [VERIFY: how the UI picks quick depth], type the name, click **Check**. The loading state lists the research steps. Do not run a deep memo live: deep is the default and takes 60 to 120 seconds, which does not fit this slot. The cached memos in tab 4 should be deep ones.

**Rishith** (while it builds): "Claude is planning about eight searches: funding, competitors, hiring, customer complaints, lawsuits, recent news. Telem runs them all in one batch call and routes each query to the engines that fit it, including platforms like LinkedIn that normal search APIs miss. Tavily searches in parallel and reads the top pages in full."

When the memo appears: "Verdict: [read it out]. Here are the risks. Every line has numbered sources. If the model writes a line without a source, our code deletes it before you see it."

**What should appear:** verdict badge (green pursue, amber dig deeper or red pass) with confidence, summary, facts, risks, open questions, source chips on every fact and risk.

**If it fails:**
- Memo is not back by 2:00: Mario switches to tab 4 (cached memo). Rishith: "This one is still running. Here's a deep memo we ran earlier today. Deep searches twice: the second round goes after what the first round couldn't answer." Keep going from the cached memo.
- Memo returns an error: same, switch to tab 4.
- Judge names a person, not a company: Rishith: "We only check companies and public information, so let's do their company" or use [FILL: demo company 1].

### 2:10 to 2:35. Trail

**On screen:** the memo, then the trail drawer on the right.

**Mario:** click the first risk's source chip. The trail drawer opens.

**Rishith:** "This is the trail. Here's the query that found this risk. Here are the engines Telem picked for it, how fast each one answered, and how many results each gave. And here's the page itself." Mario clicks the URL so it opens in a new tab, then comes back. "Every line is provable. That's the name."

**What should appear:** trail steps: plan, one search step per query with engine names and latency in ms, the read pages step, the write step.

**If it fails:**
- Drawer is empty or errors: switch to tab 4 (cached memo) and open its trail.
- Both fail: show the trail screenshot on slide 4.

### 2:35 to 2:52. Watch and business (slide 5)

**On screen:** Watch panel (tab 5) for 5 seconds, then slide 5.

**Mario:** switch to tab 5. If there is a real update, hover it. Then switch to slide 5.

**Rishith:** "And Proven keeps watching. We set a Telem monitor on [FILL: watched company] at 1 PM, and this update came in on its own." (Only say this if there is a real update on screen.) "Funds pay per seat. Companies pay per report for vendor checks. Analysts are slow, chat tools can't be audited, data platforms don't check a pitch live. Proven does all three."

**If it fails:**
- No Watch update yet: skip tab 5. Rishith says: "Watch uses Telem monitors. They run every hour, so it will report changes to this company from now on." Do not show an empty panel for long.
- Watch panel errors: skip it, go straight to slide 5.

### 2:52 to 3:00. Ask (slide 6)

**On screen:** slide 6.

**Rishith:** "We built this today. [FILL: the ask, same as slide 6]. Thank you."

**Mario:** stay on slide 6 for questions. Keep tab 4 (cached memo) one click away for questions about the trail.

---

## If everything fails

Mario plays the backup video from the start, muted. Rishith narrates the same script over it, skipping the "name a company" step. Say once: "The network is down, so here's the run we recorded at [FILL: time the video was recorded] today." Don't apologize more than once.

## Timing checkpoints (Aarav watches)

| Time | Should be at | If behind |
|---|---|---|
| 0:25 | Live Room listening | Skip the rest of the problem slide |
| 1:25 | Typing a company for the memo | Cut the "name a company" ask, use the cached memo |
| 2:10 | Opening the trail | Skip the URL click |
| 2:35 | Watch or slide 5 | Skip Watch, go to slide 5 |
| 2:52 | Slide 6 | Say only "Thank you" |
