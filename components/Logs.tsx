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
          className="text-blue-400 hover:text-blue-300 underline"
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
    <section className="border border-zinc-800 bg-zinc-900/30 p-6">
      <h2 className="mb-4 text-lg font-semibold text-zinc-100">Logs</h2>
      <div className="space-y-2 font-mono text-xs text-zinc-400 max-h-[150px] overflow-y-auto scrollbar-hide">
        {state.logs.length > 0 ? (
          state.logs.slice().reverse().map((log, index) => (
            <div key={index} className="text-zinc-400 leading-relaxed">
              <span className="text-zinc-600 mr-2">
                [{log.timestamp.toLocaleTimeString()}]
              </span>
              {linkifyMessage(log.message)}
            </div>
          ))
        ) : (
          <div className="text-zinc-600 italic">No logs yet...</div>
        )}
      </div>
    </section>
  );
}
