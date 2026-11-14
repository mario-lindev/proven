// Zoom web client (best effort): read captions / live transcript and send sentences
// to the Proven panel. The host must enable captions; Zoom may render them in an iframe,
// so this runs in every frame of the Zoom page.
(() => {
  if (window.__provenCaptions) return;
  const send = (msg) => {
    try {
      chrome.runtime.sendMessage(msg).catch(() => {});
    } catch (_) {}
  };
  const watcher = ProvenCaptions.attach({
    doc: document,
    extraSelectors: [
      "#live-transcription-subtitle",
      '[class*="live-transcription-subtitle"]',
      '[class*="closed-caption"]',
      '[class*="caption-container"]',
      '[class*="lt-full-transcript"]',
    ],
    onSentence: (s) => send({ type: "caption", site: "zoom", speaker: s.speaker, text: s.text }),
  });
  window.__provenCaptions = watcher;
  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (!msg || msg.type !== "proven-status") return;
    const st = { site: "zoom", ...watcher.status() };
    if (st.region) return reply(st);
    // Frames without captions: only the top frame answers, a moment later,
    // so a frame that did find captions gets to answer first.
    if (window === window.top) {
      setTimeout(() => reply(st), 200);
      return true;
    }
  });
})();
