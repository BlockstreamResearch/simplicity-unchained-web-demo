export const API_CONFIG = {
  // Use Next.js API routes to proxy requests and avoid CORS issues
  PROXY_BASE_URL: "/api/proxy",
  SIMPLICITY_SERVICE_URL:
    process.env.NEXT_PUBLIC_SIMPLICITY_SERVICE_URL || "http://localhost:8080",
  NETWORK: "liquid_testnet",
  ENDPOINTS: {
    COMPILE: "/compile",
    CONVERT: "/convert",
    CREATE_PSET: "/create-pset",
    SIGN_PSET: "/sign-pset",
    FINALIZE: "/finalize",
    GENERATE: "/generate",
    SIMPLICITY_SIGN: "/simplicity-sign",
    TWEAK: "/tweak",
    SIGN_MESSAGE: "/sign-message",
  },
} as const;
