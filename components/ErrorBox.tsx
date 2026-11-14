export default function ErrorBox({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded-xl border border-red-300 bg-red-50 px-5 py-4 text-red-800">
      <span className="font-semibold">Something went wrong. </span>
      {message}
    </div>
  );
}
