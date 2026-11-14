export default function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-start justify-between gap-4 rounded-xl bg-pass-soft px-5 py-4"
    >
      <div className="min-w-0">
        <p className="font-semibold text-pass">That didn&rsquo;t work</p>
        <p className="mt-1 break-words text-ink/80">{message}</p>
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md border border-pass/40 bg-surface px-4 py-1.5 font-medium text-pass hover:border-pass"
        >
          Try again
        </button>
      )}
    </div>
  );
}
