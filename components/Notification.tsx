"use client";

import { useApp } from "@/contexts/AppContext";
import { useEffect, useState } from "react";

function NotificationItem({ 
  id, 
  message,
  isError = false,
  onRemove,
  duration = 7000 
}: { 
  id: string; 
  message: string;
  isError?: boolean;
  onRemove: (id: string) => void;
  duration?: number;
}) {
  const [progress, setProgress] = useState(100);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Fade in
    setTimeout(() => setVisible(true), 10);

    // Progress animation
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(remaining);
      
      if (remaining === 0) {
        clearInterval(interval);
      }
    }, 16); // ~60fps

    return () => clearInterval(interval);
  }, [duration]);

  const handleClose = () => {
    setVisible(false);
    setTimeout(() => onRemove(id), 300);
  };

  // SVG circle parameters
  const radius = 8;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div
      className={`transition-all duration-300 ${
        visible ? "opacity-100 translate-x-0" : "opacity-0 translate-x-4"
      }`}
    >
      <div className={`flex min-w-[300px] max-w-md items-center gap-3 rounded-xl border bg-white px-4 py-3 text-ink shadow-lg ${isError ? 'border-danger/40' : 'border-line'}`}>
        <svg
          className={`h-5 w-5 flex-shrink-0 rounded-full p-0.5 ${isError ? "bg-danger-tint text-danger" : "bg-success-tint text-success"}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          {isError ? (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          ) : (
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          )}
        </svg>
        <span className="flex-1 break-words text-sm">{message}</span>
        <div className="relative w-5 h-5 flex-shrink-0">
          <svg className="w-5 h-5 -rotate-90" viewBox="0 0 20 20">
            <circle
              cx="10"
              cy="10"
              r={radius}
              stroke="#ececee"
              strokeWidth="2"
              fill="none"
            />
            <circle
              cx="10"
              cy="10"
              r={radius}
              stroke="#2308c7"
              strokeWidth="2"
              fill="none"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              strokeLinecap="round"
              style={{ transition: 'stroke-dashoffset 0.016s linear' }}
            />
          </svg>
        </div>
        <button
          onClick={handleClose}
          className="flex-shrink-0 text-muted transition-colors hover:text-ink"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}

export function Notification() {
  const { state, removeNotification } = useApp();

  return (
    <div className="fixed top-4 right-4 z-50 flex flex-col gap-3">
      {state.notifications.map((notification) => (
        <NotificationItem
          key={notification.id}
          id={notification.id}
          message={notification.message}
          isError={notification.isError}
          onRemove={removeNotification}
        />
      ))}
    </div>
  );
}
