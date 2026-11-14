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
  sentences: [], // last sentences that pass the speaker filter
  pending: null, // latest text waiting to be sent
  lastSent: "",
  inflight: false,
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
    throw new Error(`Can't reach the Proven server at ${state.base}. Is it running? Check the URL in Settings.`);
  }
  let body = null;
  try {
    body = await res.json();
  } catch (_) {}
  if (!res.ok || (body && body.error)) {
    throw new Error((body && body.error) || `Server returned ${res.status}`);
  }
  return body;
}

function queue(text) {
  const t = text.trim();
  if (!t) return;
  state.pending = t;
  pump();
}

async function pump() {
  if (state.inflight || !state.pending) return;
  const text = state.pending;
  state.pending = null;
  if (text === state.lastSent) return;
  state.lastSent = text;
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
  $("count").textContent = state.checks.length ? `(${state.checks.length})` : "";
}

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
  if (!checked) return;
  state.sentences.push(text);
  state.sentences = state.sentences.slice(-2);
  queue(state.sentences.join(" "));
}

function addTranscript(who, text, skipped) {
  const box = $("transcript");
  const empty = box.querySelector(".empty");
  if (empty) empty.remove();
  const interim = box.querySelector(".interim");
  const p = h("p", { class: skipped ? "skipped" : null }, who ? h("span", { class: "who" }, who + ":") : null, text);
  box.insertBefore(p, interim);
  while (box.querySelectorAll("p:not(.interim)").length > 200) box.firstChild.remove();
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
  $("count").textContent = state.checks.length ? `(${state.checks.length})` : "";
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
    h("span", { class: "meta" }, c.at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })),
    h("div", { class: "verdict" }, VERDICT[verdict]),
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
              s.engine ? h("span", { class: "engine" }, s.engine) : null
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
  state.lastSent = ""; // always check a typed claim, even if repeated
  queue(text);
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

function renderStatus() {
  const el = $("status");
  const st = state.tabStatus;
  const site = state.tab && state.tab.site;
  const name = site === "zoom" ? "Zoom" : "Meet";
  const heard = state.lastCaptionAt > 0;
  let text;
  let warn = false;
  if (state.micOn) text = "Using mic";
  else if (site && ((st && st.region) || (heard && Date.now() - state.lastCaptionAt < 60000)))
    text = heard ? `Listening to ${name} captions` : `Captions found in ${name}. Waiting for someone to speak.`;
  else if (site === "meet" && Date.now() - state.openedAt > 10000) {
    text = "Turn on captions (CC) in Meet so Proven can follow the call.";
    warn = true;
  } else if (site === "zoom" && Date.now() - state.openedAt > 10000) {
    text = "Captions not found: turn on captions in Zoom (the host must enable them).";
    warn = true;
  } else if (site) text = `Looking for ${name} captions…`;
  else if (heard) text = "Listening to call captions";
  else {
    text = "Open a Google Meet or Zoom web call, or use the mic or type a claim below.";
    warn = true;
  }
  el.textContent = text;
  el.classList.toggle("warn", warn);
}

chrome.tabs.onActivated.addListener(refreshTab);
chrome.tabs.onUpdated.addListener((_id, info) => info.status === "complete" && refreshTab());
setInterval(pollStatus, 3000);

// ---------- settings ----------

function cleanBase(v) {
  return (v || "").trim().replace(/\/+$/, "") || DEFAULT_BASE;
}

$("save").addEventListener("click", async () => {
  state.base = cleanBase($("base").value);
  $("base").value = state.base;
  await chrome.storage.local.set({ base: state.base });
  $("saved").textContent = "Saved";
  setTimeout(() => ($("saved").textContent = ""), 1500);
});

$("test").addEventListener("click", async () => {
  const base = cleanBase($("base").value);
  $("saved").textContent = "Testing…";
  try {
    const res = await fetch(base + "/api/live", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: "" }),
    });
    $("saved").textContent = res.ok ? "Connected" : `Server returned ${res.status}`;
  } catch (_) {
    $("saved").textContent = "Can't reach it (server down or CORS)";
  }
});

// ---------- start ----------

(async () => {
  const { base } = await chrome.storage.local.get("base");
  state.base = cleanBase(base);
  $("base").value = state.base;
  renderCards();
  await refreshTab();
  setInterval(renderStatus, 1000);
})();
