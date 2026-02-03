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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="bg-zinc-900 border border-yellow-600/50 rounded-lg shadow-2xl max-w-2xl w-full mx-4 p-6">
        {/* Warning Icon */}
        <div className="flex items-center justify-center mb-4">
          <div className="bg-yellow-600/20 rounded-full p-3">
            <svg
              className="w-8 h-8 text-yellow-500"
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
        <h2 className="text-xl font-bold text-yellow-500 text-center mb-4">
          Security Warning - Demo Environment
        </h2>

        {/* Warning Content */}
        <div className="bg-yellow-950/20 border border-yellow-600/30 rounded-lg p-4 mb-4">
          <div className="space-y-2 text-zinc-300 text-sm">
            <p>
              This is a demonstration application operating on <strong>Liquid Testnet</strong> and <strong>Bitcoin Testnet4</strong>.
            </p>
            <p>
              <strong>NEVER</strong> use your actual secret keys. This is a demo environment where keys are used for demonstration purposes only. Your keys are <strong>NOT SECURE</strong> in this environment.
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
            className="bg-yellow-600 hover:bg-yellow-700 text-zinc-900 font-semibold px-6 py-2 rounded-lg transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:ring-offset-2 focus:ring-offset-zinc-900"
          >
            I Understand - Continue to Demo
          </button>
        </div>
      </div>
    </div>
  );
}
