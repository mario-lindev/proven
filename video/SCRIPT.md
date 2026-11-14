# Proven: 2:00 demo video script

Total: 120 seconds, 11 scenes, 210 spoken words.
Voice time: Rishith 43 s, Aarav 36 s, Mario 41 s.

Every line is short enough to fit a two-line caption (about 60 characters per line). That makes the pace about 1.8 words per second, slower than the 2.4 target. Speak calmly and leave a short pause at the end of each scene.

The words below are exact. They match `captions.json` character for character. Shot images are `video/shots/<shot id>.png`.

| # | Time | Voice | Words to say (exact) | On screen | Shot id | Words |
|---|------|-------|----------------------|-----------|---------|-------|
| 1 | 0:00-0:09 | Rishith | I'm Mario, I'm 13. I'm Rishith, I'm 14. I'm Aarav, I'm 16. Investors check pitch claims by hand, days late. We built Proven. | Title card: "Proven" and the line "Checking a pitch takes days." Dark background, no UI. | `title` | 15 |
| 2 | 0:09-0:19 | Aarav | Ask AI search one question and you get one good answer. Diligence is a hundred questions. Proven runs the whole job. | Our own text slide, three columns in words only: Search engine = links you must read. Chatbot = an answer you must trust. Proven = a verdict with the receipt. No screenshots of other products. | `compare` | 22 |
| 3 | 0:19-0:28 | Mario | This is Proven. Ask about any company. It searches, reads the pages, and writes a memo while you watch. | Proven home (Research). Question box, then the live research feed filling in. | `home` | 19 |
| 4 | 0:28-0:40 | Rishith | Run everything does it in one click: a pitch audit, a full memo, and a watch that re-checks the company. | /run page, live. One click, three panels start: Pitch Audit, Memo, Watch. | `run` | 20 |
| 5 | 0:40-0:52 | Aarav | Pitch Audit on rippling.com: 8 claims in 21 seconds. 4 hold up, 2 are contradicted, 2 are unclear. Trust score 63. | /audit result for rippling.com. Claim list with hold up / contradicted / unclear marks and trust score 63. | `audit` | 21 |
| 6 | 0:52-1:04 | Mario | The Builder.ai memo. Verdict: Pass, 95% confidence. 19 of 19 lines verified. 3 high-severity contradictions. | Builder.ai memo, top of page: verdict Pass, 95% confidence, 19 of 19 lines verified. | `memo` | 15 |
| 7 | 1:04-1:15 | Rishith | It gave lenders a 2024 sales forecast of about $220M. An audit put sales at about $50M. Hover a line for the quote. | Claims vs. reality section of the Builder.ai memo. Company claim beside the independent source; pointer hovers a line and the exact quote appears. | `contradictions` | 23 |
| 8 | 1:15-1:29 | Aarav | Plan. Route through Telem and Tavily. Research until proven. Write. Find each quote in code. No quote, no line. | Architecture flow chart, seven boxes left to right: Plan, Route (Telem + Tavily), Research until proven, Write, Prove, Claims vs. reality, Learn. Each box lights up as it is named; arrow from Learn back to Plan. | `how` | 19 |
| 9 | 1:29-1:39 | Mario | Today Telem routed 237 questions across 16 engines. 67% of verified proof came from engines Telem routed to. | /telem page: 237 questions routed, 1,279 engine runs, 16 engines used, 67% (88 of 132 results, 12 memos). | `telem` | 18 |
| 10 | 1:39-1:49 | Mario | An engine earns credit only when its page backs a verified line. Proven learns only from what it could prove. | /engines score table. If cutting inside the shot: brief looks at ML Lab (/simulation) and Self-improve (/improve, 16 of 16 on the saved run). | `engines` | 20 |
| 11 | 1:49-2:00 | Rishith | For investors and buyers. Know what is true before you commit. Built by Rishith, Aarav and Mario. proven-tan.vercel.app | End card: "Know what is true before you commit." Proven. Rishith, Aarav, Mario. SearchHack 2026. Built on Telem AI and Tavily, with Claude. https://proven-tan.vercel.app | `end` | 18 |

## Lines by person

**Rishith**

- Scene 1 (0:00-0:09, 9 s): I'm Mario, I'm 13. I'm Rishith, I'm 14. I'm Aarav, I'm 16. Investors check pitch claims by hand, days late. We built Proven.
- Scene 4 (0:28-0:40, 12 s): Run everything does it in one click: a pitch audit, a full memo, and a watch that re-checks the company.
- Scene 7 (1:04-1:15, 11 s): It gave lenders a 2024 sales forecast of about $220M. An audit put sales at about $50M. Hover a line for the quote.
- Scene 11 (1:49-2:00, 11 s): For investors and buyers. Know what is true before you commit. Built by Rishith, Aarav and Mario. proven-tan.vercel.app

**Aarav**

- Scene 2 (0:09-0:19, 10 s): Ask AI search one question and you get one good answer. Diligence is a hundred questions. Proven runs the whole job.
- Scene 5 (0:40-0:52, 12 s): Pitch Audit on rippling.com: 8 claims in 21 seconds. 4 hold up, 2 are contradicted, 2 are unclear. Trust score 63.
- Scene 8 (1:15-1:29, 14 s): Plan. Route through Telem and Tavily. Research until proven. Write. Find each quote in code. No quote, no line.

**Mario**

- Scene 3 (0:19-0:28, 9 s): This is Proven. Ask about any company. It searches, reads the pages, and writes a memo while you watch.
- Scene 6 (0:52-1:04, 12 s): The Builder.ai memo. Verdict: Pass, 95% confidence. 19 of 19 lines verified. 3 high-severity contradictions.
- Scene 9 (1:29-1:39, 10 s): Today Telem routed 237 questions across 16 engines. 67% of verified proof came from engines Telem routed to.
- Scene 10 (1:39-1:49, 10 s): An engine earns credit only when its page backs a verified line. Proven learns only from what it could prove.

## Recording notes

- Each person records only their own scenes. Record one audio file per scene and name it `scene-<number>-<name>.m4a`, for example `scene-05-aarav.m4a`.
- Voiceover: use the phone Voice Memos app, or QuickTime Player on a Mac (File > New Audio Recording). Hold the phone about a hand away, in a quiet room with soft surfaces. Do not record in a hallway.
- Read the words exactly as written. The captions are already burned into the video, so a changed word will not match the screen.
- Each line must fit inside its scene time (the "s" value above). Time one practice read before you record.
- Say numbers this way: "$220M" is "two hundred twenty million dollars", "67%" is "sixty-seven percent", "19 of 19" is "nineteen of nineteen". The URL is "proven dash tan dot vercel dot app".
- Face clip: one short clip each, 5 to 10 seconds, phone held sideways (landscape) or QuickTime (File > New Movie Recording). Face a window, look at the lens, plain background. It goes in a corner of the frame during your first scene.
- Send the files to the person doing the edit. Lay each audio file at its scene start time over the video. Do not add captions; they are already there.
- Do not show screenshots of other products. Scene 2 is our own text slide.
- Scene 9 numbers are from today's runs on the demo laptop. Scene 5 and scenes 6-7 are real runs (rippling.com, Builder.ai).
