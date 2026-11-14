import type { Memo, MemoEvent, TrailStep } from "@/lib/types";

export async function streamMemo(
  input: { company: string; context?: string; depth: "quick" | "deep" },
  signal: AbortSignal,
  onStep: (step: TrailStep) => void,
): Promise<Memo> {
  const response = await fetch("/api/memo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...input, stream: true }),
    signal,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error || `Research request failed (${response.status}).`);
  }
  if (!response.body) throw new Error("The research stream is unavailable.");

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let remaining = "";

  function consume(line: string) {
    if (!line.trim()) return;
    const event = JSON.parse(line) as MemoEvent;
    if (event.type === "error") throw new Error(event.error);
    if (event.type === "step") onStep(event.step);
    if (event.type === "memo") return event.memo;
  }

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      const lines = (remaining + value).split("\n");
      remaining = lines.pop() ?? "";
      for (const line of lines) {
        const memo = consume(line);
        if (memo) return memo;
      }
    }
    const memo = consume(remaining);
    if (memo) return memo;
    throw new Error("Research ended before a memo arrived. Please try again.");
  } finally {
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
