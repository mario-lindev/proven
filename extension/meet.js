// Google Meet: read live captions (CC) and send each stable sentence to the Proven panel.
(() => {
  if (window.__provenCaptions) return; // already injected
  const send = (msg) => {
    try {
      chrome.runtime.sendMessage(msg).catch(() => {}); // panel may be closed
    } catch (_) {} // extension reloaded: context gone
  };
  const watcher = ProvenCaptions.attach({
    doc: document,
    onSentence: (s) => send({ type: "caption", site: "meet", speaker: s.speaker, text: s.text }),
  });
  window.__provenCaptions = watcher;
  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg && msg.type === "proven-status") reply({ site: "meet", ...watcher.status() });
  });
})();
