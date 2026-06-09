export default function Loading() {
  return (
    <div className="flex min-h-[50vh] items-center justify-center bg-[var(--color-bg)]">
      <div className="flex flex-col items-center gap-4">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[var(--color-border)] border-t-emerald-400" />
        <p className="text-sm text-[var(--color-muted)]">Chajman…</p>
      </div>
    </div>
  );
}
