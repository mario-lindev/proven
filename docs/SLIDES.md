# Slides: Proven, 3-minute final

Six slides. Slides 3 and 4 are mostly the live app; the slide is only there as a backdrop and a fallback if the app fails.
Rishith talks. Mario drives. Timings match `docs/DEMO_SCRIPT.md`.

Rules for every slide: one headline, big text, dark on white, one accent colour. No number on a slide that we did not measure or source.

---

## Slide 1: Title (0:00 to 0:10)

**Headline:** Proven. Diligence where every line has a source.

- Check a startup, vendor or market in [MEASURE: seconds per quick memo] seconds.
- Fact-check a pitch while it is being spoken.
- Built on Telem and Tavily.

**Speaker notes:** "We're Proven. We tell investors whether a company is worth pursuing, and we show the source for every line we write."

---

## Slide 2: The problem (0:10 to 0:25)

**Headline:** Pitch claims get checked by hand, days later, or never.

- Founders say "no competitors", "a $40B market", "we grew 3x".
- An analyst checks each one by hand after the meeting.
- AI chat answers are fast, but you can't show a partner where each sentence came from.

**Speaker notes:** "You've all heard 'we have no competitors' this week. Checking that takes someone hours of searching. And if you ask a chatbot, you get an answer you can't audit."

---

## Slide 3: Live Room (0:25 to 1:25)

**Headline:** Live Room checks claims as they are spoken.

- The mic transcribes the pitch in the browser.
- Each checkable claim becomes a card: green supported, red contradicted, amber unclear.
- Every card lists the pages that back the verdict.

**Speaker notes:** "Let me pitch you Proven while Proven listens. ... We have no competitors." (Pause. Point at the red card.) "It found real competitors, with sources, before I finished the next sentence."

Backup visual on this slide: a screenshot of the red "no competitors" card from our rehearsal run.

---

## Slide 4: How it works, and the trail (1:25 to 2:35)

**Headline:** Every line is provable. Click it and see the search.

- Claude plans the queries. Telem runs them in one batch call, auto-routing each query to the engines it fits.
- Tavily searches in parallel and reads the top pages in full. A deep memo searches a second time for what's still missing.
- Claude writes only from those sources. Code drops any line without a valid citation.
- The trail shows each query, which engines answered, their latency, and the page each line came from.

**Speaker notes:** "Name a company." (Judge names one, Mario types it.) While it builds: "Telem routes every query to the right engines, including platforms like LinkedIn that normal search APIs miss. And it tells us which engine answered and how fast. That's the trail you're about to see." Then click a risk: "This risk came from this page, found by this engine, for this query. That's why it's called Proven."

Backup visual on this slide: a screenshot of the trail drawer, opened on a risk, showing engines and latency.

---

## Slide 5: Business (2:35 to 2:52)

**Headline:** Funds pay per seat. Companies pay per report.

- **Customer:** seed and early-stage funds and accelerators first. Then corporate development and procurement teams checking vendors.
- **Pricing:** [DECIDE: price per seat per month] per seat for funds. [DECIDE: price per report] per report for companies.
- **Market:** [SOURCE: number of VC funds or analysts we can cite, with the source, or delete this line].
- **Competition and our edge:** manual analyst research is slow. Generic AI chat assistants are fast but not auditable. Existing data platforms for private companies have records, not live checks. Proven is fast, cites every line, shows its trail, checks pitches live and keeps watching with Telem monitors.

**Speaker notes:** "Funds pay per seat, companies pay per report. Our edge over analysts is speed, over chat tools it's the audit trail, and over data platforms it's the live check. And Watch keeps tracking the company after the memo."

If Watch has a real update: Mario shows the Watch panel for 5 seconds while Rishith says "This update came in from a Telem monitor we set at 1 PM."

---

## Slide 6: The ask and the team (2:52 to 3:00)

**Headline:** We're looking for [DECIDE: the ask, e.g. three funds to pilot Proven on their next ten pitches].

- Rishith: lead, AI and integration.
- Aarav: search layer, Telem and Tavily.
- Mario: product, UI and demo.
- Try it: [LINK: deployed URL or QR code].

**Speaker notes:** "We built this today, and we'd like to run it on your next pitches. Thank you."
