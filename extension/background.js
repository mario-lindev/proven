// Clicking the Proven toolbar icon opens the side panel.
chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((e) => console.error("Proven: setPanelBehavior failed", e));
