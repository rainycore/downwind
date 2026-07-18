// Dev-only auth bypass so the analyzer UI can be exercised without a configured
// Auth0 tenant. Gated on NODE_ENV === "development", so it is a physical no-op
// in any production build (`next build` forces NODE_ENV="production", making
// this constant false regardless of the env var). Opt in per-machine with
// DEV_AUTH_BYPASS=true in .env.local.
export const DEV_AUTH_BYPASS =
  process.env.NODE_ENV === "development" && process.env.DEV_AUTH_BYPASS === "true";
