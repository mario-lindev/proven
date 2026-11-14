import Link from "next/link";

export default function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const missingModelKey = /could not resolve authentication method|ANTHROPIC_API_KEY.*(?:missing|required|not configured)/i.test(message);
  return (
    <div role="alert" className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-pass/30 border-l-4 border-l-pass bg-pass-soft px-5 py-4">
      <div className="min-w-0">
        <p className="font-semibold text-pass">{missingModelKey ? "Claim analysis needs an AI model key" : "That didn’t work"}</p>
        <p className="mt-1 break-words text-ink/80">{missingModelKey
          ? "Transcription can run without a model key. Checking claims and writing research memos require ANTHROPIC_API_KEY on the server. Configure it in Setup, then retry. The ML Lab simulation works without API keys."
          : message}</p>
        {missingModelKey && <div className="mt-3 flex flex-wrap gap-4 text-sm">
          <Link href="/setup" className="font-semibold text-cobalt underline underline-offset-4">Open key setup</Link>
          <Link href="/simulation" className="text-graphite underline underline-offset-4">Use the ML simulation</Link>
        </div>}
      </div>
      {onRetry && !missingModelKey && <button type="button" onClick={onRetry} className="rounded-md border border-pass/40 bg-surface px-4 py-1.5 font-medium text-pass hover:border-pass">Try again</button>}
    </div>
  );
}
