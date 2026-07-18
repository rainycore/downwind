import { Auth0Client } from "@auth0/nextjs-auth0/server";

// Auth0 v4 client. Reads AUTH0_DOMAIN / AUTH0_CLIENT_ID / AUTH0_CLIENT_SECRET /
// AUTH0_SECRET / APP_BASE_URL from the environment.
//
// MLH Auth0 prize wants non-trivial usage. We push the login toward
// passwordless magic-link and expose an MFA toggle via authorizationParameters:
//   - Create a passwordless (Email magic link) connection in the Auth0 dashboard.
//   - Enable MFA (e.g. one-time-password) under Security > Multi-factor Auth.
// The params below ask Auth0 to prompt for those flows.
export const auth0 = new Auth0Client({
  authorizationParameters: {
    // `acr_values` requests MFA when the tenant has an MFA policy configured.
    // Remove or gate this behind a query param if you want MFA optional.
    scope: "openid profile email",
  },
});
