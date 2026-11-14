// Proven side panel: transcript in, claim checks out.
"use strict";

const DEFAULT_BASE = "http://localhost:3000";
const VERDICT = {
  supported: "Checks out",
  contradicted: "Contradicted",
  unclear: "Unclear",
};
const $ = (id) => document.getElementById(id);

const state = {
  base: DEFAULT_BASE,
  unsent: [], // [{text, alone}] waiting to go to /api/live, oldest first
  context: "", // last sentence sent, sent again before new ones for context
  recent: [], // normalized sentences already queued (no duplicate submissions)
  inflight: false,
  server: "unknown", // "ok" | "down" | "unknown"
  company: { heard: "", edited: false },
  checks: [], // newest first
  claimsSeen: new Set(),
  speakers: new Set(),
  openedAt: Date.now(),
  lastCaptionAt: 0,
  tab: null, // { id, site: "meet" | "zoom" | null }
  tabStatus: null, // reply from the content script
  injected: new Set(),
  mic: null,
  micOn: false,
};

// ---------- helpers ----------

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === "class") el.className = v;
    else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

function safeUrl(u) {
  try {
    const url = new URL(u);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch (_) {
    return null;
  }
}

function hostOf(u) {
  try {
    return new URL(u).hostname.replace(/^www\./, "");
  } catch (_) {
    return u;
  }
}

function normClaim(s) {
  return String(s).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function showError(msg) {
  const el = $("error");
  el.hidden = !msg;
  el.textContent = msg || "";
}

function siteOf(url) {
  if (!url) return null;
  if (/^https:\/\/meet\.google\.com\//.test(url)) return "meet";
  if (/^https:\/\/([a-z0-9-]+\.)*zoom\.us\//.test(url)) return "zoom";
  return null;
}

// ---------- server ----------

async function api(path, init) {
  let res;
  try {
    res = await fetch(state.base + path, init);
  } catch (e) {
    setServer("down");
    throw new Error(`Can't reach the Proven server at ${state.base}. Is it running? Check the URL in Settings.`);
  }
  setServer("ok");
  let body = null;
  try {
    body = await res.json();
  } catch (_) {}
  if (!res.ok || (body && body.error)) {
    throw new Error((body && body.error) || `Server returned ${res.status}`);
  }
  return body;
}

function setServer(s) {
  if (state.server === s) return;
  if (s === "ok" && state.server === "down") showError(""); // server is back: drop the "can't reach" banner
  state.server = s;
  renderStatus();
}

// Queue a sentence for checking. Returns false if the same sentence was already queued.
// alone: send it by itself (typed claims), not after the previous sentence.
function queue(text, alone) {
  const t = text.trim();
  const key = normClaim(t);
  if (!key) return false;
  if (!alone) {
    if (state.recent.includes(key)) return false;
    state.recent.push(key);
    if (state.recent.length > 100) state.recent.shift();
  }
  state.unsent.push({ text: t, alone: !!alone });
  pump();
  return true;
}

// Next request body: one typed claim alone, or up to 3 new sentences after the last one sent.
function nextBatch() {
  if (!state.unsent.length) return null;
  if (state.unsent[0].alone) return state.unsent.shift().text;
  const batch = [];
  while (batch.length < 3 && state.unsent.length && !state.unsent[0].alone) batch.push(state.unsent.shift().text);
  const text = [state.context, ...batch].filter(Boolean).join(" ");
  state.context = batch[batch.length - 1];
  return text;
}

async function pump() {
  if (state.inflight) return;
  const text = nextBatch();
  if (!text) return;
  state.inflight = true;
  $("busy").hidden = false;
  try {
    const body = await api("/api/live", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    showError("");
    addChecks((body && body.checks) || []);
  } catch (e) {
    showError(e.message);
  } finally {
    state.inflight = false;
    $("busy").hidden = true;
    pump();
  }
}

function addChecks(checks) {
  for (const c of checks) {
    if (!c || !c.claim) continue;
    const key = normClaim(c.claim);
    if (state.claimsSeen.has(key)) continue; // same claim re-sent in the next window
    state.claimsSeen.add(key);
    const check = { ...c, at: new Date() };
    state.checks.unshift(check);
    // Prepend only the new card so an open "See how" trail stays open.
    const empty = $("cards").querySelector(".empty");
    if (empty) empty.remove();
    $("cards").prepend(card(check));
  }
  renderCounts();
}

function renderCounts() {
  const n = (v) => state.checks.filter((c) => c.verdict === v).length;
  $("nChecked").textContent = state.checks.length;
  $("nSupported").textContent = n("supported");
  $("nContradicted").textContent = n("contradicted");
}

// ---------- company detection (for "Research this company") ----------

const NOT_COMPANY = new Set(
  "a an the this that it we our us they i you he she there here today so and but my its google meet zoom".split(" ")
);
const CO = "([A-Z][\\w&'.-]*(?:\\s+[A-Z][\\w&'.-]*){0,2})";
const CO_PATTERNS = [
  new RegExp("\\b(?:founder|co-?founder|cofounder|CEO|CTO|COO)\\s+(?:of|at)\\s+" + CO),
  new RegExp("\\b(?:[Hh]ere at|[Ww]e at|I'm from|I am from|[Ww]e're from|[Ww]e are from|[Ww]elcome to|[Pp]itching|is called|are called|[Ww]e're called|it's called)\\s+" + CO),
  new RegExp("\\b(?:[Mm]y|[Oo]ur) (?:company|startup),?\\s+" + CO),
];

// Pull a company name out of a spoken sentence, or "" if none.
function detectCompany(text) {
  for (const re of CO_PATTERNS) {
    const m = String(text).match(re);
    if (!m) continue;
    const name = m[1].replace(/[.,'’-]+$/, "").trim();
    const first = name.split(/\s+/)[0].toLowerCase();
    if (name.length < 2 || NOT_COMPANY.has(first)) continue;
    return name;
  }
  return "";
}

function noteCompany(text) {
  const name = detectCompany(text);
  if (!name || name === state.company.heard) return;
  state.company.heard = name;
  const input = $("company");
  if (!state.company.edited || !input.value.trim()) {
    input.value = name;
    state.company.edited = false;
  }
  const box = $("heard");
  box.hidden = false;
  box.replaceChildren(
    "Heard on the call: ",
    h("button", { type: "button", onclick: () => (($("company").value = name), (state.company.edited = false)) }, name)
  );
}

function researchUrl(name, depth) {
  return `${state.base}/?company=${encodeURIComponent(name)}&depth=${depth}&go=1`;
}

$("company").addEventListener("input", () => (state.company.edited = true));
$("research").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = $("company").value.trim();
  if (!name) return $("company").focus();
  const depth = e.submitter && e.submitter.dataset.depth === "quick" ? "quick" : "deep";
  const url = researchUrl(name, depth);
  if (chrome.tabs && chrome.tabs.create) chrome.tabs.create({ url });
  else window.open(url, "_blank", "noopener");
});

// ---------- transcript ----------

function onSentence(speaker, text) {
  const who = speaker || "";
  if (who && who !== "Mic" && !state.speakers.has(who)) {
    state.speakers.add(who);
    $("speaker").append(h("option", { value: who }, who));
  }
  const filter = $("speaker").value;
  const checked = !filter || who === filter;
  addTranscript(who, text, !checked);
  noteCompany(text);
  if (!checked) return;
  queue(text);
}

function addTranscript(who, text, skipped) {
  const box = $("transcript");
  const empty = box.querySelector(".empty");
  if (empty) empty.remove();
  const interim = box.querySelector(".interim");
  const p = h("p", { class: skipped ? "skipped" : null }, who ? h("span", { class: "who" }, who + ":") : null, text);
  box.insertBefore(p, interim);
  while (box.querySelectorAll("p:not(.interim)").length > 80) box.firstChild.remove();
  box.scrollTop = box.scrollHeight;
}

function setInterim(text) {
  const box = $("transcript");
  let el = box.querySelector(".interim");
  if (!text) return el && el.remove();
  if (!el) {
    const empty = box.querySelector(".empty");
    if (empty) empty.remove();
    el = h("p", { class: "interim" });
    box.append(el);
  }
  el.textContent = text;
  box.scrollTop = box.scrollHeight;
}

chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || msg.type !== "caption" || !msg.text) return;
  state.lastCaptionAt = Date.now();
  onSentence(msg.speaker, msg.text);
  renderStatus();
});

// ---------- cards ----------

function renderCards() {
  const box = $("cards");
  box.replaceChildren();
  renderCounts();
  if (!state.checks.length) {
    box.append(h("p", { class: "empty" }, "Claims the founder makes will appear here, newest first."));
    return;
  }
  for (const c of state.checks) box.append(card(c));
}

function card(c) {
  const verdict = VERDICT[c.verdict] ? c.verdict : "unclear";
  const sources = (c.sources || []).slice(0, 3);
  const trailBox = h("div");
  let open = false;
  const toggle = h("button", { class: "seehow", type: "button" }, "See how");
  toggle.addEventListener("click", async () => {
    open = !open;
    toggle.textContent = open ? "Hide" : "See how";
    if (!open) return trailBox.replaceChildren();
    trailBox.replaceChildren(h("p", { class: "muted small" }, "Loading the research trail…"));
    try {
      const trail = await api("/api/trail/" + encodeURIComponent(c.trail_id));
      trailBox.replaceChildren(trailList(trail));
    } catch (e) {
      trailBox.replaceChildren(h("p", { class: "muted small" }, "Trail unavailable: " + e.message));
    }
  });
  return h(
    "article",
    { class: "card " + verdict },
    h(
      "div",
      { class: "card-top" },
      h("span", { class: "verdict" }, VERDICT[verdict]),
      h("span", { class: "meta" }, c.at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }))
    ),
    h("p", { class: "claim" }, `“${c.claim}”`),
    c.note ? h("p", { class: "note" }, c.note) : null,
    sources.length
      ? h(
          "ul",
          { class: "sources" },
          sources.map((s) => {
            const url = safeUrl(s.url);
            const label = s.title || hostOf(s.url);
            return h(
              "li",
              {},
              url ? h("a", { href: url, target: "_blank", rel: "noopener noreferrer", title: url }, label) : label,
              h("span", { class: "domain" }, hostOf(s.url) + (s.engine ? " · " + s.engine : ""))
            );
          })
        )
      : h("p", { class: "muted small" }, "No sources returned."),
    c.trail_id ? toggle : null,
    trailBox
  );
}

function trailList(trail) {
  const steps = (trail && trail.steps) || [];
  if (!steps.length) return h("p", { class: "muted small" }, "No steps recorded.");
  return h(
    "ol",
    { class: "trail" },
    steps.map((s) =>
      h(
        "li",
        {},
        h("strong", {}, s.label || s.kind),
        s.ms != null ? ` · ${s.ms} ms` : "",
        s.engines && s.engines.length
          ? h(
              "div",
              {},
              s.engines
                .map((e) => `${e.name} ${e.latency_ms} ms, ${e.n_results} results${e.error ? " (error: " + e.error + ")" : ""}`)
                .join(" · ")
            )
          : null,
        s.urls && s.urls.length ? h("div", { class: "urls" }, s.urls.slice(0, 5).map(hostOf).join(", ")) : null
      )
    )
  );
}

// ---------- copy all ----------

function checksAsText() {
  const lines = [`Proven live checks, ${new Date().toLocaleString()}`, ""];
  [...state.checks].reverse().forEach((c, i) => {
    lines.push(`${i + 1}. "${c.claim}": ${VERDICT[c.verdict] || "Unclear"}`);
    if (c.note) lines.push(`   ${c.note}`);
    for (const s of (c.sources || []).slice(0, 3)) lines.push(`   - ${s.title || hostOf(s.url)} (${s.engine}) ${s.url}`);
    lines.push("");
  });
  return lines.join("\n");
}

$("copy").addEventListener("click", async () => {
  const text = checksAsText();
  try {
    await navigator.clipboard.writeText(text);
  } catch (_) {
    const ta = h("textarea", {}, text);
    document.body.append(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
  $("copy").textContent = state.checks.length ? "Copied" : "Nothing yet";
  setTimeout(() => ($("copy").textContent = "Copy all"), 1500);
});

// ---------- typed claim ----------

$("typed").addEventListener("submit", (e) => {
  e.preventDefault();
  const text = $("claim").value.trim();
  if (!text) return;
  $("claim").value = "";
  addTranscript("You typed", text, false);
  queue(text, true); // always check a typed claim, even if repeated
});

// ---------- microphone (Web Speech API) ----------

function micHelp(msg, withGrant) {
  const box = $("micHelp");
  box.hidden = !msg;
  box.replaceChildren();
  if (!msg) return;
  box.append(msg + " ");
  if (withGrant) {
    box.append(
      h("a", { href: "#", onclick: (e) => (e.preventDefault(), chrome.tabs.create({ url: chrome.runtime.getURL("mic.html") })) }, "Allow microphone"),
      " then try again, or "
    );
  }
  box.append(h("a", { href: safeUrl(state.base + "/live") || "#", target: "_blank", rel: "noopener" }, "open the web Live Room"), ".");
}

function startMic() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return micHelp("This browser has no speech recognition.", false);
  const rec = new SR();
  rec.continuous = true;
  rec.interimResults = true;
  rec.lang = "en-US";
  rec.onresult = (ev) => {
    let interim = "";
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      const r = ev.results[i];
      const t = r[0].transcript.trim();
      if (r.isFinal) {
        if (t) onSentence("Mic", t);
      } else interim += t + " ";
    }
    setInterim(interim.trim());
  };
  rec.onerror = (ev) => {
    if (ev.error === "no-speech" || ev.error === "aborted") return;
    stopMic();
    if (ev.error === "not-allowed" || ev.error === "service-not-allowed")
      micHelp("Chrome blocked the microphone in the side panel.", true);
    else if (ev.error === "audio-capture") micHelp("No microphone found.", false);
    else micHelp("Speech recognition failed (" + ev.error + ").", true);
  };
  rec.onend = () => {
    if (state.micOn) {
      try {
        rec.start(); // Chrome stops after silence; keep going
      } catch (_) {}
    }
  };
  try {
    rec.start();
  } catch (e) {
    return micHelp("Could not start the microphone: " + e.message, true);
  }
  state.mic = rec;
  state.micOn = true;
  micHelp("");
  $("mic").textContent = "Stop microphone";
  $("mic").classList.add("on");
  renderStatus();
}

function stopMic() {
  state.micOn = false;
  if (state.mic) {
    try {
      state.mic.stop();
    } catch (_) {}
  }
  state.mic = null;
  setInterim("");
  $("mic").textContent = "Use microphone";
  $("mic").classList.remove("on");
  renderStatus();
}

$("mic").addEventListener("click", () => (state.micOn ? stopMic() : startMic()));

// ---------- call tab status ----------

async function refreshTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    state.tab = tab ? { id: tab.id, site: siteOf(tab.url) } : null;
  } catch (_) {
    state.tab = null;
  }
  await pollStatus();
}

async function pollStatus() {
  const t = state.tab;
  if (!t || !t.site) {
    state.tabStatus = null;
    return renderStatus();
  }
  try {
    state.tabStatus = await chrome.tabs.sendMessage(t.id, { type: "proven-status" });
  } catch (_) {
    state.tabStatus = null;
    // Tab was open before the extension loaded: inject the caption reader now.
    if (!state.injected.has(t.id)) {
      state.injected.add(t.id);
      try {
        await chrome.scripting.executeScript({
          target: { tabId: t.id, allFrames: t.site === "zoom" },
          files: ["captions.js", t.site + ".js"],
        });
      } catch (e) {
        console.warn("Proven: inject failed", e);
      }
    }
  }
  renderStatus();
}

const SITE_NAME = { meet: "Google Meet", zoom: "Zoom" };

// Returns {title, hint, tone} for the status box. tone: "live" | "warn" | "idle".
function statusInfo(now) {
  const st = state.tabStatus;
  const site = state.tab && state.tab.site;
  const name = SITE_NAME[site] || "the call";
  const heard = state.lastCaptionAt > 0;
  const recent = heard && now - state.lastCaptionAt < 60000;
  const ccHint =
    site === "zoom"
      ? "Turn on captions (CC) in Zoom's bottom bar. The host must allow them."
      : "Turn on captions (CC) in Meet's bottom bar, or press c.";
  if (state.micOn) return { title: "Listening: microphone", hint: "Hears the room through this laptop's mic.", tone: "live" };
  if (site && ((st && st.region) || recent))
    return {
      title: `Listening to ${name} captions`,
      hint: heard ? "" : "Captions are on. Waiting for someone to speak.",
      tone: "live",
    };
  if (site && now - state.openedAt > 10000) return { title: `Connected to ${name}: no captions found`, hint: ccHint, tone: "warn" };
  if (site) return { title: `Connected to ${name}`, hint: "Looking for captions…", tone: "idle" };
  if (recent) return { title: "Listening to call captions", hint: "", tone: "live" };
  return {
    title: "No call in this tab",
    hint: "Open a Google Meet or Zoom web call in this window, or type a claim below.",
    tone: "warn",
  };
}

function renderStatus() {
  const s = statusInfo(Date.now());
  $("status").textContent = s.title;
  $("hint").textContent = s.hint;
  const box = $("statusBox");
  box.classList.toggle("live", s.tone === "live");
  box.classList.toggle("warn", s.tone === "warn");
  const sv = $("server");
  const host = state.base.replace(/^https?:\/\//, "");
  sv.textContent =
    state.server === "down"
      ? `Proven server offline (${host}). Start it or fix the URL in Settings.`
      : state.server === "ok"
        ? `Proven server: ${host}`
        : "";
  sv.classList.toggle("down", state.server === "down");
}

chrome.tabs.onActivated.addListener(refreshTab);
chrome.tabs.onUpdated.addListener((_id, info) => info.status === "complete" && refreshTab());
setInterval(pollStatus, 3000);

// ---------- settings ----------

// GET /api/memos on base. Returns true, or a short failure message.
async function ping(base) {
  try {
    const res = await fetch(base + "/api/memos", { cache: "no-store" });
    if (!res.ok) return `Failed: server returned ${res.status}`;
    const body = await res.json().catch(() => null);
    return body && Array.isArray(body.memos) ? true : "Failed: that URL is not a Proven server";
  } catch (_) {
    return "Failed: can't reach it (server down, wrong URL, or CORS)";
  }
}

function cleanBase(v) {
  return (v || "").trim().replace(/\/+$/, "") || DEFAULT_BASE;
}

$("save").addEventListener("click", async () => {
  state.base = cleanBase($("base").value);
  $("base").value = state.base;
  await chrome.storage.local.set({ base: state.base });
  setServer("unknown");
  ping(state.base).then((ok) => setServer(ok === true ? "ok" : "down"));
  $("saved").textContent = "Saved";
  setTimeout(() => ($("saved").textContent = ""), 1500);
});

$("test").addEventListener("click", async () => {
  const base = cleanBase($("base").value);
  $("saved").textContent = "Testing…";
  const ok = await ping(base);
  $("saved").textContent = ok === true ? "Connected" : ok;
  if (base === state.base) setServer(ok === true ? "ok" : "down");
});

// ---------- start ----------

(async () => {
  const { base } = await chrome.storage.local.get("base");
  state.base = cleanBase(base);
  $("base").value = state.base;
  renderCards();
  ping(state.base).then((ok) => setServer(ok === true ? "ok" : "down"));
  await refreshTab();
  setInterval(renderStatus, 1000);
})();
