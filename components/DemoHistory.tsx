import { panelClass } from "./ui";

export interface HistoryItem {
  title: string;
  detail: string;
  meta?: string;
  href?: string;
  state: "done" | "active" | "pending" | "failed";
  error?: string;
}

function Marker({ state }: { state: HistoryItem["state"] }) {
  if (state === "done") {
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-success-tint text-success">
        <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2.4} aria-hidden><path d="M5 10.5l3.2 3L15 7" strokeLinecap="round" strokeLinejoin="round" /></svg>
      </span>
    );
  }
  if (state === "failed") {
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-danger-tint text-danger">
        <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2.4} aria-hidden><path d="M6 6l8 8M14 6l-8 8" strokeLinecap="round" /></svg>
      </span>
    );
  }
  if (state === "active") {
    return (
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-brand-tint">
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand border-t-transparent" aria-hidden />
      </span>
    );
  }
  return (
    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface">
      <span className="h-2 w-2 rounded-full bg-pill" aria-hidden />
    </span>
  );
}

const stateLabel = { done: "Done", active: "In progress", pending: "Pending", failed: "Failed" };

export function DemoHistory({ items }: { items: HistoryItem[] }) {
  const completed = items.filter((item) => item.state === "done").length;
  return (
    <section aria-labelledby="history-heading" className={panelClass}>
      <div className="mb-4 flex items-center justify-between gap-2 px-1">
        <h2 id="history-heading" className="flex items-center gap-2 text-sm font-medium text-ink">
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden><path d="M3.5 10a6.5 6.5 0 102-4.7M3.5 3v3h3M10 6.5V10l2.5 1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
          Full History
        </h2>
        <p className="text-xs text-muted">{completed} of {items.length} steps complete</p>
      </div>
      <ol className="rounded-xl bg-white px-4 py-2 sm:px-5">
        {items.map((item, index) => (
          <li key={item.title} className="relative flex gap-3 py-3">
            {index < items.length - 1 && (
              <span className={`absolute left-[13px] top-10 bottom-0 w-px ${item.state === "done" ? "bg-success-dot/50" : "bg-line"}`} aria-hidden />
            )}
            <Marker state={item.state} />
            <div className={`min-w-0 flex-1 ${item.state === "pending" ? "opacity-60" : ""}`}>
              <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="font-medium text-ink">{item.title}</span>
                <span className="sr-only">({stateLabel[item.state]})</span>
                {item.meta && (item.href
                  ? <a href={item.href} target="_blank" rel="noopener noreferrer" className="font-mono text-xs text-brand hover:underline">{item.meta} ↗</a>
                  : <span className="font-mono text-xs text-muted">{item.meta}</span>)}
              </p>
              <p className="mt-0.5 text-xs text-muted">{item.detail}</p>
              {item.error && <p role="alert" className="mt-1.5 break-words text-xs text-danger">{item.error}</p>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
