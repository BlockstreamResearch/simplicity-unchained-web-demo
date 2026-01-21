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
      <div className={`${isError ? 'bg-red-600' : 'bg-emerald-600'} text-white px-6 py-3 rounded shadow-lg flex items-center gap-3 min-w-[300px]`}>
        <svg
          className="w-5 h-5 flex-shrink-0"
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
        <span className="flex-1 text-sm">{message}</span>
        <div className="relative w-5 h-5 flex-shrink-0">
          <svg className="w-5 h-5 -rotate-90" viewBox="0 0 20 20">
            <circle
              cx="10"
              cy="10"
              r={radius}
              stroke="rgba(255,255,255,0.2)"
              strokeWidth="2"
              fill="none"
            />
            <circle
              cx="10"
              cy="10"
              r={radius}
              stroke="white"
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
          className={`transition-colors flex-shrink-0 ${isError ? 'text-white hover:text-red-100' : 'text-white hover:text-emerald-100'}`}
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
