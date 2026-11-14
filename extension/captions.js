// Proven caption reader. Shared by meet.js, zoom.js and test-captions.html.
//
// Pure parts (no DOM side effects, time passed in):
//   norm, splitSentences, parseLines, createTracker
// DOM parts:
//   findCaptionRegion, readCaptionLines, attach (MutationObserver runner)
//
// Exposed as the global `ProvenCaptions`.
(function (root) {
  "use strict";

  const END = /[.?!]["')\]]*$/;

  // Lowercase, drop punctuation, collapse spaces. Used to dedupe sentences.
  function norm(s) {
    return String(s)
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  // Split on . ? ! followed by a space, so "$40.5B" and "3.5x" stay whole.
  function splitSentences(text) {
    return String(text)
      .replace(/\s+/g, " ")
      .trim()
      .split(/(?<=[.?!]["')\]]*)\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const NOISE = [
    /^[a-z]+(_[a-z]+)+$/, // icon-font ligatures like "arrow_downward"
    /^\d{1,2}:\d{2}(:\d{2})?\s*(am|pm)?$/i, // timestamps
    /^(jump to bottom|captions?|live transcript|transcript|subtitles?)$/i,
  ];
  const NAME = /^[\p{Lu}][\p{L}'’.-]*(\s+[\p{Lu}(][\p{L}'’.()-]*){0,4}$/u;

  // Is this line a speaker name header (short, no end punctuation, Title Case)?
  // A line right after a header is always caption text ("Alice" / "Okay").
  function isHeader(line, afterHeader) {
    if (afterHeader) return false;
    if (line.length > 40 || /[.?!,:;]$/.test(line)) return false;
    return NAME.test(line) || /\(you\)$/i.test(line) || line === "You";
  }

  // Turn caption text lines into [{speaker, text}]. Handles
  // "Name\ntext" (Meet) and "Name: text" (Zoom) layouts.
  function parseLines(lines, ignore) {
    const skip = new Set((ignore || []).map((s) => s.trim()).filter(Boolean));
    const clean = lines
      .map((l) => l.replace(/\s+/g, " ").trim())
      .filter((l) => l && !skip.has(l) && !NOISE.some((re) => re.test(l)));
    const out = [];
    let cur = null;
    for (let i = 0; i < clean.length; i++) {
      const line = clean[i];
      if (isHeader(line, !!cur && cur.isHeader && !cur.text)) {
        cur = { speaker: line.replace(/\s*\(you\)$/i, ""), text: "", isHeader: true };
        out.push(cur);
        continue;
      }
      const colon = line.match(/^([\p{Lu}][\p{L}'’. -]{0,30}):\s+(.+)$/u);
      if (colon && NAME.test(colon[1].trim())) {
        cur = { speaker: colon[1].trim(), text: colon[2] };
        out.push(cur);
        continue;
      }
      if (!cur) {
        cur = { speaker: "", text: "" };
        out.push(cur);
      }
      cur.text = cur.text ? cur.text + " " + line : line;
    }
    // A header with no text yet (new line just started) is dropped.
    return out.filter((l) => l.text).map((l) => ({ speaker: l.speaker, text: l.text }));
  }

  // Turns successive caption snapshots into stable, deduped sentences.
  // update(lines, now) and tick(now) return [{speaker, text}] to emit.
  function createTracker(opts) {
    const stableMs = (opts && opts.stableMs) || 1500; // unpunctuated tail
    const punctMs = (opts && opts.punctMs) || 700; // tail ending in . ? !
    const emitted = new Map(); // speaker -> recent normalized sentences
    const pending = new Map(); // speaker -> {text, since, done}

    function emit(speaker, sentence, out) {
      const n = norm(sentence);
      if (n.length < 2) return;
      const list = emitted.get(speaker) || [];
      emitted.set(speaker, list);
      for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (e === n || e.startsWith(n + " ")) return; // same, or a shorter rewrite
        if (n.startsWith(e + " ")) {
          // We already sent the start of this sentence; send only the rest.
          const words = sentence.trim().split(/\s+/);
          const rest = words.slice(e.split(" ").length).join(" ");
          list[i] = n;
          if (norm(rest)) out.push({ speaker, text: rest });
          return;
        }
        // Meet rewrote a word in a sentence we already sent: skip.
        const k = Math.floor(Math.min(e.length, n.length) * 0.7);
        if (k > 12 && e.slice(0, k) === n.slice(0, k) && Math.abs(e.length - n.length) < 8) return;
      }
      list.push(n);
      if (list.length > 40) list.shift();
      out.push({ speaker, text: sentence.trim() });
    }

    function tick(now) {
      const out = [];
      for (const [speaker, p] of pending) {
        if (p.done) continue;
        const wait = END.test(p.text) ? punctMs : stableMs;
        if (now - p.since >= wait) {
          emit(speaker, p.text, out);
          p.done = true;
        }
      }
      return out;
    }

    function update(lines, now) {
      const out = [];
      const last = new Map();
      lines.forEach((l, i) => last.set(l.speaker, i));
      lines.forEach((l, i) => {
        const segs = splitSentences(l.text);
        segs.forEach((seg, j) => {
          const isTail = i === last.get(l.speaker) && j === segs.length - 1;
          if (!isTail) return emit(l.speaker, seg, out);
          const p = pending.get(l.speaker);
          if (!p || p.text !== seg) pending.set(l.speaker, { text: seg, since: now, done: false });
        });
      });
      // A speaker whose line scrolled away: their tail is final.
      for (const [speaker, p] of pending) {
        if (!last.has(speaker)) {
          if (!p.done) emit(speaker, p.text, out);
          pending.delete(speaker);
        }
      }
      return out.concat(tick(now));
    }

    return { update, tick };
  }

  // ---------- DOM ----------

  function isButtonish(el) {
    return !!(el.closest && el.closest('button, [role="button"], [role="menu"], [role="menuitem"]'));
  }

  function textOf(el) {
    return (el.innerText != null ? el.innerText : el.textContent) || "";
  }

  // Find the captions container without relying on obfuscated class names.
  function findCaptionRegion(doc, extraSelectors) {
    const found = [];
    doc.querySelectorAll("[aria-label]").forEach((el) => {
      const label = el.getAttribute("aria-label") || "";
      if (!/caption|subtitle|transcri/i.test(label)) return;
      if (/turn (on|off)|settings|options|language|size|font/i.test(label)) return;
      if (isButtonish(el) || el.tagName === "INPUT") return;
      let score = 0;
      if (el.getAttribute("role") === "region") score += 2;
      if (el.hasAttribute("aria-live")) score += 1;
      if (textOf(el).trim()) score += 2;
      found.push({ el, score });
    });
    (extraSelectors || []).forEach((sel) => {
      try {
        doc.querySelectorAll(sel).forEach((el) => {
          if (!isButtonish(el) && textOf(el).trim()) found.push({ el, score: 1 });
        });
      } catch (_) {}
    });
    found.sort((a, b) => b.score - a.score);
    return found.length ? found[0].el : null;
  }

  function readCaptionLines(region) {
    const ignore = [];
    region.querySelectorAll('button, [role="button"]').forEach((b) => {
      textOf(b).split("\n").forEach((t) => ignore.push(t));
    });
    return parseLines(textOf(region).split("\n"), ignore);
  }

  // Watch the page and call onSentence({speaker, text}) for each stable sentence.
  // opts: { doc, extraSelectors, onSentence, now, stableMs, punctMs }
  function attach(opts) {
    const doc = opts.doc || document;
    const now = opts.now || (() => Date.now());
    const tracker = createTracker(opts);
    let region = null;
    let mode = "none"; // "aria" | "fallback" | "none"
    let lastCaptionAt = 0;
    let scheduled = false;
    let changed = new Set();
    let counts = new Map();
    let countsSince = now();

    const send = (list) =>
      list.forEach((s) => {
        lastCaptionAt = now();
        opts.onSentence(s);
      });

    // Fallback: the element near the bottom of the page whose text changes most.
    function noteChanges() {
      const h = (doc.defaultView && doc.defaultView.innerHeight) || 800;
      let n = 0;
      for (const node of changed) {
        if (n++ > 60) break;
        let el = node.nodeType === 1 ? node : node.parentElement;
        if (!el || !el.isConnected || isButtonish(el)) continue;
        const r = el.getBoundingClientRect();
        if (r.height === 0 || r.top < h * 0.55) continue;
        for (let up = 0; up < 6; up++) {
          const p = el.parentElement;
          if (!p || p === doc.body) break;
          const pr = p.getBoundingClientRect();
          if (pr.top < h * 0.5 || textOf(p).length > 1500) break;
          el = p;
        }
        counts.set(el, (counts.get(el) || 0) + 1);
      }
      changed = new Set();
      if (now() - countsSince > 30000) {
        counts = new Map();
        countsSince = now();
      }
    }

    function fallbackRegion() {
      let best = null;
      let bestN = 5;
      for (const [el, c] of counts) {
        if (c > bestN && el.isConnected && textOf(el).trim()) {
          best = el;
          bestN = c;
        }
      }
      return best;
    }

    function scan() {
      scheduled = false;
      if (!region || !region.isConnected || mode === "fallback") {
        const aria = findCaptionRegion(doc, opts.extraSelectors);
        if (aria) {
          region = aria;
          mode = "aria";
        } else {
          noteChanges();
          region = fallbackRegion();
          mode = region ? "fallback" : "none";
        }
      }
      changed = new Set();
      if (region) send(tracker.update(readCaptionLines(region), now()));
    }

    const observer = new MutationObserver((muts) => {
      for (const m of muts) changed.add(m.target);
      if (!scheduled) {
        scheduled = true;
        setTimeout(scan, 120);
      }
    });
    observer.observe(doc.body, { subtree: true, childList: true, characterData: true });
    const timer = setInterval(() => send(tracker.tick(now())), 250);
    scan();

    return {
      status: () => ({ region: !!(region && region.isConnected), mode, lastCaptionAt }),
      stop: () => {
        observer.disconnect();
        clearInterval(timer);
      },
    };
  }

  root.ProvenCaptions = {
    norm,
    splitSentences,
    parseLines,
    createTracker,
    findCaptionRegion,
    readCaptionLines,
    attach,
  };
})(typeof window !== "undefined" ? window : globalThis);
