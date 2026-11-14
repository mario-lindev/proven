# Proven for Chrome: live claim checks on video calls

On a Google Meet (or Zoom web) call with a founder, a side panel checks each factual claim against the web as it is spoken: green **Checks out**, red **Contradicted**, amber **Unclear**, with sources and the research trail. One click opens a full research memo on the company.

Plain Manifest V3. No build step, no npm packages.

## Install (4 steps)

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked**.
4. Pick this `extension/` folder. Pin Proven from the puzzle-piece menu.

After editing a file: click the reload arrow on the Proven card, then reload the call tab.

## Use it

1. Start the Proven server (`npx next dev -p 3313` in the repo root) or use the deployed URL (see Settings below).
2. Join the call: **Google Meet** at meet.google.com, or **Zoom web client** (app.zoom.us, "Join from your browser"; not the desktop app).
3. Turn on captions: **CC** in the bottom bar (Meet: or press `c`). On Zoom the host must allow captions.
4. Click the Proven icon. The panel opens and shows **Listening to Google Meet captions** (green dot).

The panel shows:
- **Status**: which call it is connected to, whether captions were found, and whether the Proven server answers. "No captions found" means captions are off: turn on CC.
- **Counts**: claims checked, how many check out, how many are contradicted.
- **Claims**: newest first, coloured by verdict, with a one-line note, the source's own words as a quote line when the server sends them (`Source says: "..."`), and source links (title + domain). **See how** shows the research trail.
- **Transcript**: a compact running log of what was said.
- **Type a claim** and press Check if you want to check something by hand.

Each caption sentence is sent once it is stable (about 1.5 s with no change, sooner when it ends in . ? !). The same sentence is never sent twice; each request carries the new sentences plus the one before them for context.

## Research this company

Type the company name (or let the panel fill it in: when someone says "I'm the CEO of Acme" or "here at Acme", it suggests **Acme**) and press:
- **Deep memo**: opens `{server}/?company=Acme&depth=deep&go=1`, which starts a full streaming memo (1 to 2 minutes).
- **Quick**: same with `depth=quick` (faster, fewer searches).

The name in this field is also sent with every live check (`context` in the `POST /api/live` body) so the server knows which company the claims are about.

## Audit this page

Open any web page (a startup's site, a pitch page, a press release) and press **Audit this page**. It opens `{server}/audit?url=<the tab's URL>&go=1`: the web app's Pitch Audit, which checks every claim on that page against independent sources. The button is off, with a hint, on pages that are not http(s) (new tab, `chrome://`) and on the Proven app itself. Reading the tab's URL is why the extension asks for the `tabs` permission.

## Settings

**Settings** at the bottom of the panel: the Proven server URL (default `http://localhost:3313`, the demo server; change it if yours runs elsewhere). Press **Save** (kept in `chrome.storage.local`), then **Test connection** (calls `GET /api/health`, shows **Connected (real keys)**, **Connected (demo data)** or Failed). The extension has host access to `localhost`, `127.0.0.1` and `*.vercel.app`; other hosts must send CORS headers (the `/api/*` routes do).

**Call options**: **Only check this speaker** (pick the founder so your own questions are not checked) and **Use microphone** (backup, Chrome speech recognition).

## Troubleshooting

| You see | Do this |
|---|---|
| "Connected to Google Meet: no captions found" | Turn on captions (CC). Wait for someone to speak. |
| "No call in this tab" | Click into the Meet / Zoom tab in the same window as the panel. |
| "Proven server offline" (red) | Start the server, or fix the URL in Settings, then Test connection. |
| Tab was open before you installed or reloaded the extension | Reload the call tab (the panel also tries to inject itself). |
| Zoom shows nothing | Use the web client, check the host enabled captions, or use the microphone / type claims. |
| Microphone blocked in the side panel | Click **Allow microphone** in Call options (opens a one-time tab), or open `{server}/live`. |

## Privacy

Only caption text is sent, to the Proven server you set. No audio is sent to Proven, nothing is recorded, nothing is stored except the server URL. The microphone backup uses Chrome's speech recognition, which may run on Google's servers.

## Known limits

- Meet and Zoom class names are obfuscated and change. Captions are found by `aria-label` ("Captions"), then by the bottom-of-page text that changes most often. If that breaks, use the microphone or type claims.
- Proven only sees what the captions show, including their mistakes. Speaker names come from the caption layout.
- Company detection is a simple pattern match on phrases like "CEO of X", "here at X", "called X". Check the name before you press the button.

## Files

| File | What it does |
|---|---|
| `manifest.json` | MV3 manifest: side panel, content scripts, host access |
| `background.js` | Opens the side panel when you click the toolbar icon |
| `captions.js` | Caption reader: finds the captions, parses speaker + text, dedupes rewrites, emits stable sentences |
| `meet.js` / `zoom.js` | Content scripts: run the reader, send `{type: "caption", speaker, text}` to the panel |
| `panel.html` / `panel.css` / `panel.js` | The side panel |
| `mic.html` / `mic.js` | One-time microphone permission page |
| `test-captions.html` | Test: simulated Meet / Zoom captions through `captions.js` |
| `test-panel.html` | Test: the real panel with a fake `chrome` API and fake server |

## Tests (no call needed)

```sh
python3 -m http.server 8765 -d extension &   # from the repo root
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
for p in test-captions.html "test-captions.html?mode=fallback" "test-captions.html?mode=zoom" test-panel.html; do
  "$CHROME" --headless=new --virtual-time-budget=20000 --dump-dom "http://localhost:8765/$p" | grep -o '<title>[^<]*'
done
```

Each prints `PASS (...)` or `FAIL (...)`; open the page in Chrome to see which check failed. `test-panel.html` covers status text, the CC hint, company detection, request batching and dedupe, card order and colours, counts, the quote line, the `context` field, Audit this page (URL, off on non-http pages and on Proven itself), the research URLs, server-down errors and Test connection (real keys / demo data). Add `?server=http://localhost:3331` to also hit a real server started with `MOCK=1 npx next dev -p 3331`.
