export const API_CONFIG = {
  // Use Next.js API routes to proxy requests and avoid CORS issues for server-side operations
  PROXY_BASE_URL: "/api/proxy",
  SIMPLICITY_SERVICE_URL:
    process.env.NEXT_PUBLIC_SIMPLICITY_SERVICE_URL || "http://localhost:8080",
  NETWORK: "liquid_testnet",
  BITCOIN_NETWORK: "testnet4",
  ENDPOINTS: {
    // Server-side only endpoints (require Simplicity Unchained service)
    SIMPLICITY_SIGN: "/simplicity-sign",
    SIMPLICITY_SIGN_PSBT: "/simplicity-sign-psbt",
    TWEAK: "/tweak",
  },
  GOOGLE_ANALYTICS_ID: process.env.NEXT_PUBLIC_GOOGLE_ANALYTICS_ID || "",
} as const;
