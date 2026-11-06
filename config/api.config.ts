export const API_CONFIG = {
  SIMPLICITY_SERVICE_URL:
    process.env.NEXT_PUBLIC_SIMPLICITY_SERVICE_URL || "http://localhost:30431",
  GOOGLE_ANALYTICS_ID: process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID || "",
} as const;
