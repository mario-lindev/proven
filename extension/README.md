# Proven for Chrome: live claim checks on video calls

While you are on a Google Meet (or Zoom web) call with a founder, a side panel shows each factual claim they make, checked against the web: green **Checks out**, red **Contradicted**, amber **Unclear**, with sources and the research trail.

Plain Manifest V3. No build step and no npm packages.

## Load it

1. Open `chrome://extensions`.
2. Turn on **Developer mode** (top right).
3. Click **Load unpacked** and pick this `extension/` folder.
4. Pin Proven from the puzzle-piece menu so its icon is in the toolbar.

After editing any file, click the reload arrow on the Proven card in `chrome://extensions`, then reload the Meet tab.

## Use it on Google Meet

1. Start the Proven server (`npm run dev` in the repo root), or deploy it.
2. Join the call at meet.google.com.
3. Turn on captions: the **CC** button in Meet's bottom bar (or press `c`).
4. Click the Proven icon. The side panel opens and says **Listening to Meet captions**.
5. Optional: pick the founder in **Only check this speaker**, so your own questions are not checked.

Each sentence is sent once it is stable (about 1.5 s with no change, sooner when it ends in . ? !). The panel sends the last two sentences to `POST /api/live`, one request at a time. **See how** on a card loads the research trail. **Copy all** copies every check as plain text for your notes.

If no captions show up 10 s after the panel opens on a Meet tab, the panel says: "Turn on captions (CC) in Meet so Proven can follow the call."

Backups, in the panel:
- **Use microphone**: Chrome speech recognition (Web Speech API). On speakers it also hears the other person. If Chrome blocks the microphone in the side panel, click **Allow microphone** (opens a small extension tab that asks once), or open the web Live Room at `{server}/live`.
- **Type a claim**: type it and press Check.

## Server URL

Open **Settings** at the bottom of the panel. Default `http://localhost:3000`. Set it to your deployed URL (for example `https://proven-xyz.vercel.app`), press **Save** (stored in `chrome.storage.local`), then **Test connection**. The extension has host access to `localhost`, `127.0.0.1` and `*.vercel.app`; any other host must send CORS headers (the `/api/*` routes do).

## Zoom (best effort)

Works in the Zoom **web client** only (`app.zoom.us` and `*.zoom.us/wc/...`), not the desktop app. The host must enable captions or live transcript, and you must turn them on. Zoom renders captions differently from Meet and changes its page often, so test before relying on it. The microphone and typed claims always work as backups.

## Privacy

- Only caption text is used: the last two sentences are sent to the Proven server you set. No audio is sent to Proven.
- Proven does not record the call. Nothing is stored except your server URL setting.
- The microphone backup uses Chrome's built-in speech recognition, which Chrome may process on Google's servers.

## Known limits

- Meet and Zoom class names are obfuscated and change. The reader finds captions by `aria-label` ("Captions"), then falls back to the text near the bottom of the page that changes most often. If Meet changes its captions page a lot, captions may stop being read; use the microphone or type claims.
- Captions must be on. Proven only sees what the captions show, including their mistakes.
- Speaker names come from the caption layout. If Meet shows no names, the speaker filter has nothing to list.
- This checks claims; it does not record or transcribe the whole call.

## Files

| File | What it does |
|---|---|
| `manifest.json` | MV3 manifest: side panel, content scripts, host access |
| `background.js` | Opens the side panel when you click the toolbar icon |
| `captions.js` | Shared caption reader: finds the captions, parses speaker + text, dedupes rewrites, emits stable sentences |
| `meet.js` / `zoom.js` | Content scripts: run the reader and send `{type: "caption", speaker, text}` to the panel |
| `panel.html` / `panel.css` / `panel.js` | The side panel |
| `mic.html` / `mic.js` | One-time microphone permission page for the side panel |
| `test-captions.html` | Local test: simulates Meet-style captions and checks what `captions.js` emits |

## Test the caption reader without a call

Open `test-captions.html` in Chrome (drag the file into a tab). It types captions word by word, rewrites a line ("we have to competitors" becomes "we have no competitors."), adds a second speaker and scrolls a line away, then shows **PASS** or **FAIL**. Links at the top run the same script without `aria-label` (fallback finder) and in Zoom's "Name: text" layout.

Headless run:

```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new \
  --virtual-time-budget=20000 --dump-dom "file://$PWD/extension/test-captions.html" | grep -o 'PASS ([a-z]*)\|FAIL ([a-z]*)'
```
