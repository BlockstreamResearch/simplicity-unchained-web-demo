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
    SIGHASH_PSET: "/sighash-pset",
    SIGHASH_PSBT: "/sighash-psbt",
    FINALIZE: "/finalize",
    FINALIZE_PSBT: "/finalize-psbt",
    SIMPLICITY_SIGN: "/simplicity-sign",
    SIMPLICITY_SIGN_PSBT: "/simplicity-sign-psbt",
    TWEAK: "/tweak",
  },
} as const;
