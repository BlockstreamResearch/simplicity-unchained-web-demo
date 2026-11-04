"use client";

import { useState, useEffect } from "react";

export function WarningModal() {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // Check if user has seen the warning before
    const hasSeenWarning = localStorage.getItem("hasSeenSecurityWarning");
    
    if (!hasSeenWarning) {
      setIsOpen(true);
    }
  }, []);

  const handleAccept = () => {
    localStorage.setItem("hasSeenSecurityWarning", "true");
    setIsOpen(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-sm">
      <div className="mx-4 w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl">
        {/* Warning Icon */}
        <div className="flex items-center justify-center mb-4">
          <div className="rounded-full bg-warning-tint p-3">
            <svg
              className="h-7 w-7 text-warning"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
        </div>

        {/* Title */}
        <h2 className="mb-4 text-center text-xl font-semibold text-ink">
          Security Warning - Demo Environment
        </h2>

        {/* Warning Content */}
        <div className="mb-5 rounded-xl bg-surface p-4">
          <div className="space-y-2 text-sm text-muted">
            <p>
              This is a demonstration application operating on <strong className="text-ink">Liquid Testnet</strong> and <strong className="text-ink">Bitcoin Testnet4</strong>.
            </p>
            <p>
              <strong className="text-ink">NEVER</strong> use your actual secret keys. This is a demo environment where keys are used for demonstration purposes only. Your keys are <strong className="text-ink">NOT SECURE</strong> in this environment.
            </p>
            <p>
              It's better to get UTXOs from faucets and never, under any condition, use your real secret keys.
            </p>
          </div>
        </div>

        {/* Accept Button */}
        <div className="flex justify-center">
          <button
            onClick={handleAccept}
            className="rounded-md bg-brand px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-brand-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2"
          >
            I Understand - Continue to Demo
          </button>
        </div>
      </div>
    </div>
  );
}
