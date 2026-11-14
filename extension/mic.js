// Grants the extension origin microphone access, which the side panel then reuses.
document.getElementById("allow").addEventListener("click", async () => {
  const out = document.getElementById("result");
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach((t) => t.stop());
    out.textContent = "Microphone allowed. You can close this tab and press Use microphone in the panel.";
  } catch (e) {
    out.textContent = "Microphone blocked (" + e.name + "). Allow it from the lock icon in the address bar, then try again.";
  }
});
