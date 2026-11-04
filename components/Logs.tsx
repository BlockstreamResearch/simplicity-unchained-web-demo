"use client";

import { useApp } from "@/contexts/AppContext";

// Helper function to detect and linkify URLs
function linkifyMessage(message: string) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const parts = message.split(urlRegex);
  
  return parts.map((part, index) => {
    if (part.match(urlRegex)) {
      return (
        <a
          key={index}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand hover:text-brand-hover underline"
        >
          {part}
        </a>
      );
    }
    return <span key={index}>{part}</span>;
  });
}

export function Logs() {
  const { state } = useApp();

  return (
    <section className="rounded-xl bg-white p-5">
      <h2 className="mb-4 text-lg font-semibold text-ink">Logs</h2>
      <div className="space-y-2 font-mono text-xs text-muted max-h-[150px] overflow-y-auto scrollbar-hide">
        {state.logs.length > 0 ? (
          state.logs.slice().reverse().map((log, index) => (
            <div key={index} className="text-muted leading-relaxed">
              <span className="text-subtle mr-2">
                [{log.timestamp.toLocaleTimeString()}]
              </span>
              {linkifyMessage(log.message)}
            </div>
          ))
        ) : (
          <div className="text-subtle italic">No logs yet...</div>
        )}
      </div>
    </section>
  );
}
