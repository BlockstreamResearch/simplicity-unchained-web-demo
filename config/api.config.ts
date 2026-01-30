export const API_CONFIG = {
  // Use Next.js API routes to proxy requests and avoid CORS issues
  PROXY_BASE_URL: "/api/proxy",
  SIMPLICITY_SERVICE_URL:
    process.env.NEXT_PUBLIC_SIMPLICITY_SERVICE_URL || "http://localhost:8080",
  NETWORK: "liquid_testnet",
  BITCOIN_NETWORK: "testnet4",
  ENDPOINTS: {
    COMPILE: "/compile",
    CONVERT: "/convert",
    CREATE_PSET: "/create-pset",
    CREATE_PSBT: "/create-psbt",
    SIGN_PSET: "/sign-pset",
    SIGN_PSBT: "/sign-psbt",
    FINALIZE: "/finalize",
    FINALIZE_PSBT: "/finalize-psbt",
    GENERATE: "/generate",
    SIMPLICITY_SIGN: "/simplicity-sign",
    SIMPLICITY_SIGN_PSBT: "/simplicity-sign-psbt",
    TWEAK: "/tweak",
    SIGN_MESSAGE: "/sign-message",
  },
} as const;
