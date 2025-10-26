# Payload CMS + Better Auth Integration Plan

## Objective & Scope
- Replace Payload’s built-in local authentication with Better Auth acting as an OAuth2/OpenID Connect-compatible identity provider.
- Reuse the existing Better Auth deployment verified in `docs/better-auth-tested.md`; integration work focuses solely on connecting Payload to that service.
- Support a seamless admin login experience (SSO) and JWT-protected API access across serverless Next.js deployments.
- Provide an Auth0-style SPA login flow powered entirely by Better Auth (PKCE public client) for front-end applications.
- Keep Payload as the system of record for content permissions while Better Auth manages credentials, MFA, and social providers.
- Remove local login fallback entirely so every authentication path flows through Better Auth.

## High-Level Architecture
- **Better Auth Service**: Existing Next.js (App Router) deployment running `better-auth` with the OIDC provider + JWT plugins. Stores user identities in its current Turso/SQLite instance (no changes required).
- **Payload CMS (`payload-app`)**: Next.js serverless deployment embedding Payload. Disables local auth, adds a custom auth strategy that validates Better Auth JWTs, and uses middleware to drive OAuth redirects.
- **Shared Concerns**:
  - JWKS endpoint exposed by Better Auth for JWT verification.
    - Production path: `https://<auth-domain>/api/auth/jwks`.
  - Shared secrets/env vars for webhook verification, admin API access, and cookie signing.
  - Observability (structured logs, tracing) routed to a central service (e.g., Sentry).

```
Browser ↔ Payload Admin (Next.js) ↔ Better Auth (Next.js) ↔ Turso (auth DB)
           │                               │
           └────────── API clients ────────┘
```

## Better Auth Service (Existing)
- The Better Auth OIDC provider already runs as a standalone application. The verified happy-path flow (sign-in → authorize → token → userinfo → jwks) is documented in `docs/better-auth-tested.md`; treat that script as the canonical contract for endpoints, payloads, and environment variables.
- Integration work in this repository must consume that live service as-is—no new Next.js project, ORM bootstrapping, or database migrations on the auth side. The service continues to use its current Turso/SQLite setup and secret management.
- Required env vars for Payload match the tested script: `AUTH_BASE_URL` (Better Auth origin), `PAYLOAD_CLIENT_ID`, `PAYLOAD_CLIENT_SECRET`, `PAYLOAD_REDIRECT_URI`, plus any optional SPA client identifiers. Keep values in sync with the trusted clients already provisioned in Better Auth.
- Better Auth stays responsible for credential storage, MFA, and social providers. Payload only trusts JWTs issued by the service and keeps using its own `role` field for authorization decisions.
- Any additional operational work (monitoring, analytics) should hook into the existing Better Auth deployment rather than creating a new one.

## Payload CMS Integration
### 1. Payload Configuration Updates
- Install dependencies: `pnpm add jose cross-fetch`.
- Extend `payload.config.ts`:
  - Import custom auth strategy module.
  - Register `onInit` hook to attach Express middleware for guard/redirect in admin routes.
  - Expose Better Auth env vars through Payload’s server runtime (`process.env.AUTH_BASE_URL`, `process.env.PAYLOAD_CLIENT_ID`, `process.env.PAYLOAD_CLIENT_SECRET`, any JWKS cache TTLs).

### 2. Users Collection
- Keep the existing schema as-is and append one new field to persist the Better Auth handle:
  ```ts
  {
    name: "betterAuthUserId",
    type: "text",
    unique: true,
    index: true,
    admin: { readOnly: true },
  }
  ```
  Place the field in the sidebar so admins can inspect the link but not edit it manually.
- Continue using the built-in `role` select and related access helpers—authorization logic must continue to key off the single `role` value.
- Set `auth.disableLocalStrategy = true` and register `[betterAuthStrategy]` while leaving `useAPIKey` untouched if API keys remain in use.
- Add a `beforeChange` hook scoped to creates that calls Better Auth’s sign-up endpoint (`POST /api/auth/sign-up/email`) whenever a new Payload user lacks `betterAuthUserId`. Pass the admin-entered email, name, and any required metadata; on success, merge the returned identifier into the doc so it is persisted in Payload.
- Guard updates so that `betterAuthUserId` remains immutable once stored—subsequent edits should not call sign-up again unless a recovery path is explicitly required.
- Implement `betterAuthStrategy.authenticate`:
  1. Extract token from `Authorization` header or `betterAuthToken` cookie.
  2. Validate signature & claims using JWKS (`createRemoteJWKSet(new URL("/api/auth/jwks", process.env.AUTH_BASE_URL!))`) and enforce expiry/issuer/audience.
  3. For bearer access tokens, JWKS validation is sufficient; if you choose to accept other token types (e.g., opaque, refresh-session) call Better Auth’s introspection endpoint before trusting them.
  4. Upsert the user document by `betterAuthUserId`/email (create if missing with default role = `user`), hydrate profile fields, but never overwrite an existing `role`. Return `{ user: { collection: "users", ...doc } }`.

### 3. Middleware for Admin Redirect
- Inside `payloadConfig.onInit`, attach Express middleware executed before Payload admin route handling:
  - If `req.user` exists, continue.
  - Otherwise, build Better Auth authorize URL:
    ```
    const state = crypto.randomUUID();
    const { verifier, challenge } = await createPkcePair();
    storePkce(req, res, { state, verifier }); // encrypted cookie/session
    const authorizeURL = new URL(`${process.env.AUTH_BASE_URL}/api/auth/oauth2/authorize`);
    authorizeURL.searchParams.set("client_id", process.env.PAYLOAD_CLIENT_ID!);
    authorizeURL.searchParams.set("redirect_uri", callbackUrl);
    authorizeURL.searchParams.set("response_type", "code");
    authorizeURL.searchParams.set("scope", "openid email profile");
    authorizeURL.searchParams.set("state", state);
    authorizeURL.searchParams.set("code_challenge", challenge);
    authorizeURL.searchParams.set("code_challenge_method", "S256");
    ```
  - Redirect unauthenticated users; for API calls return 401 with `WWW-Authenticate`.
- Remove the legacy Payload login screen—any visit to `/admin/login` should either redirect to `betterAuth` or display a brief message before redirecting so there is no local-auth fallback.
- Expose the same logic through a first-party endpoint (`/api/auth/url`) so the admin login component and other SSR routes can fetch a ready-made authorize URL while the server persists the PKCE verifier.
  ```ts
  // payload-app/src/app/api/auth/url/route.ts
  import { cookies } from "next/headers";
  import { NextResponse } from "next/server";
  import { createPkcePair } from "@/lib/pkce";

  export async function GET() {
    const state = crypto.randomUUID();
    const { verifier, challenge } = await createPkcePair();
    cookies().set("betterAuthState", JSON.stringify({ state, verifier }), {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
    });

    const authorizeURL = new URL(
      `${process.env.AUTH_BASE_URL!}/api/auth/oauth2/authorize`,
    );
    authorizeURL.searchParams.set("client_id", process.env.PAYLOAD_CLIENT_ID!);
    authorizeURL.searchParams.set("redirect_uri", process.env.PAYLOAD_REDIRECT_URI!);
    authorizeURL.searchParams.set("response_type", "code");
    authorizeURL.searchParams.set("scope", "openid email profile");
    authorizeURL.searchParams.set("state", state);
    authorizeURL.searchParams.set("code_challenge", challenge);
    authorizeURL.searchParams.set("code_challenge_method", "S256");

    return NextResponse.json({ authorizeURL: authorizeURL.toString() });
  }
  ```
- Provide `/auth/callback` route in Next.js layer:
  1. Receive `code`/`state`, verify CSRF `state`.
  2. Retrieve stored PKCE verifier, exchange code with Better Auth (`POST ${AUTH_BASE_URL}/api/auth/oauth2/token`) supplying:
     - `grant_type=authorization_code`
     - `client_id`
     - `client_secret` (confidential client only)
     - `code_verifier`
  3. Set `betterAuthToken` (HTTP-only, `SameSite=Lax`) with `Set-Cookie` and redirect back to `/admin`.
     ```ts
     // payload-app/src/app/auth/callback/route.ts
     const tokenRes = await fetch(
       `${process.env.AUTH_BASE_URL}/api/auth/oauth2/token`,
       {
         method: "POST",
         headers: {
           "Content-Type": "application/x-www-form-urlencoded",
           Authorization: `Basic ${Buffer.from(
             `${process.env.PAYLOAD_CLIENT_ID}:${process.env.PAYLOAD_CLIENT_SECRET}`,
           ).toString("base64")}`,
         },
         body: new URLSearchParams({
           grant_type: "authorization_code",
           code,
           redirect_uri: process.env.PAYLOAD_REDIRECT_URI!,
           code_verifier,
         }),
       },
     );
     const { access_token, id_token } = await tokenRes.json();
     cookies().set("betterAuthToken", access_token, {
       httpOnly: true,
       sameSite: "lax",
       secure: true,
       path: "/",
     });
     ```

### 4. Admin UI Overrides
- Override `admin` configuration:
  ```ts
  admin: {
    components: {
      routes: {
        Login: path.resolve(__dirname, "./components/BetterAuthLogin.tsx"),
      },
      afterNavLinks: [...],
    },
  }
  ```
- `BetterAuthLogin.tsx` should call a server endpoint (e.g., `/api/auth/url`) that prepares the PKCE state/cookies and returns the authorize URL, then perform the redirect. Provide a logout button that calls Better Auth’s logout endpoint (e.g., `/api/auth/oauth2/logout`) and clears the JWT cookie.

### 5. SPA Clients (Auth0 Replacement)
- Use the Better Auth OIDC client plugin on the SPA to orchestrate redirects:
  ```ts
  import { createAuthClient } from "better-auth/client";
  import { oidcClient } from "better-auth/client/plugins";

  export const authClient = createAuthClient({
    baseURL: process.env.NEXT_PUBLIC_AUTH_BASE_URL,
    plugins: [
      oidcClient({
        clientId: process.env.NEXT_PUBLIC_PAYLOAD_SPA_CLIENT_ID!,
        redirectUri: `${window.location.origin}/auth/callback`,
        postLogoutRedirectUri: `${window.location.origin}/`,
        scope: "openid email profile",
      }),
    ],
  });
  ```
- During `authClient.oidc.signIn`, the plugin generates PKCE values, stores them in session storage, and redirects to Better Auth’s authorize endpoint. The SPA callback reads `code`/`state`, calls `authClient.oidc.handleCallback`, and receives ID/access tokens plus refresh tokens (if enabled).
- Persist tokens in memory or secure browser storage (e.g., `IndexedDB` via WebCrypto). Avoid HttpOnly cookies for SPA tokens to prevent CSRF.
- Provide `authClient.oidc.getAccessToken()` when issuing requests to Payload; attach as `Authorization: Bearer <token>` or leverage `fetch` interceptors.
- Implement silent renewal using an iframe or background `refresh_token` call prior to expiry; revoke tokens and clear storage on logout (`authClient.oidc.signOut`).
- For cross-tab sync, listen for `storage` events (token removal) or use BroadcastChannel to coordinate logout.

### 6. API Consumers
- Document expectation for clients to send `Authorization: Bearer <jwt>`.
- Implement helper `authenticateRequest` used in hooks/access control: call `payload.auth({ headers: req.headers })` to reuse strategy logic.

## Authentication Flow
### Admin / SSR (Confidential Client)
1. User navigates to `/admin`.
2. Middleware detects missing session → calls `/api/auth/url` server-side to generate PKCE `state` + `verifier`. The endpoint stores the verifier in an HttpOnly cookie and returns the Better Auth authorize URL.
3. Payload redirects the browser to the returned URL (`https://auth.../api/auth/oauth2/authorize?client_id=...&code_challenge=...`).
4. Better Auth renders `/sign-in`, collects credentials, sets its session cookie, and redirects to the configured admin `redirect_uri` with an authorization code.
5. Payload’s `/auth/callback` route reads the stored `state`/`verifier`, verifies CSRF, and posts to `/api/auth/oauth2/token` (confidential client secret + PKCE `code_verifier`) to obtain tokens.
6. Payload stores the access token securely (e.g., HttpOnly `betterAuthToken` cookie scoped to the admin domain) and redirects back to `/admin`.
7. `betterAuthStrategy` uses the cookie/`Authorization` header to validate requests against `https://auth.<domain>/api/auth/jwks`. Expired tokens trigger middleware to restart the flow at step 2.

### SPA / Public Client
1. The SPA uses `authClient.oidc.signIn()` (PKCE flow). The plugin generates/verifies state in session storage and builds the authorize URL.
2. Browser redirects to `https://auth.../api/auth/oauth2/authorize?client_id=<PAYLOAD_SPA_CLIENT_ID>&code_challenge=...` (no secret required).
3. After authentication, Better Auth redirects back to the SPA callback with `code` + `state`. The SPA calls `authClient.oidc.handleCallback()` which POSTs to `/api/auth/oauth2/token` with the stored PKCE `code_verifier`. Returned tokens stay client-side (memory, secure storage, etc.).
4. API calls to Payload include `Authorization: Bearer <access_token>`; the Payload strategy validates the token via JWKS.
5. Silent refresh (via refresh_token) or re-run `signIn()` before expiration. Logout clears SPA storage and optionally calls Better Auth’s logout endpoint.

## Deployment Strategy
- **Environments**: dev, staging, production. Mirror env vars with secure managers and point each Payload environment at the corresponding Better Auth tenant covered in `docs/better-auth-tested.md`. No new auth infrastructure or database work is required.
- **Domain Model**:
  - Better Auth: `auth.example.com` (existing Next.js deployment backed by Turso/SQLite).
  - Payload CMS: `cms.example.com`.
  - Configure CORS and cookie domains (`.example.com`) to share sessions across subdomains.
- **CI/CD**:
  - Update Payload’s deploy pipeline to run the Better Auth verification script (or equivalent smoke test) against the target tenant before promotion.
  - Share client IDs/secrets via the same secret manager used by Better Auth and rotate them in lockstep.
  - Block deployments if Better Auth health checks fail; there is no local-auth feature flag or fallback.

## Testing & Validation
- **Unit**: Token validation helpers (mock JWKS), middleware behavior, and the user creation hook that calls Better Auth sign-up (stub HTTP client).
- **Integration**: Playwright tests executing the full admin redirect flow against staging Better Auth + Payload.
- **SPA**: Cypress/Playwright tests covering PKCE generation, callback handling, silent token refresh, and logout across tabs.
- **Security**: Perform JWT tampering tests, ensure CSRF `state` validation, check cookie flags (Secure, HttpOnly).
- **Load**: Simulate concurrent logins to confirm Better Auth/Turso capacity and Payload PKCE storage resilience.
- **Monitoring**: Use synthetic checks on `/admin` to ensure redirect + callback chain stays healthy.

## Security & Compliance Considerations
- Rotate JWKS daily; configure Payload to cache keys with TTL shorter than rotation window.
- Log authentication events with audit context (user id, ip, user agent) and forward to SIEM.
- Implement webhook from Better Auth to Payload to revoke sessions when user disabled.
- Enforce MFA via Better Auth policies; surface status in Payload admin banner if user missing MFA.
- Keep scopes minimal; tokens should contain only required claims (user id, email, roles ref).
- For SPA tokens, use proof of possession where possible (DPoP) or at least rotate refresh tokens frequently; encrypt at rest if stored in IndexedDB.
- Ensure GDPR-compliant data processing (DSAR, deletion) by syncing removal across both systems.

## Rollout & Migration Plan
1. Validate the staging Better Auth tenant with the script in `docs/better-auth-tested.md` and confirm Payload’s client IDs/secrets match.
2. Backfill `betterAuthUserId` for existing Payload users (one-off script that looks up Better Auth accounts by email) before enabling the new strategy.
3. Deploy the Payload changes to staging, run end-to-end admin login tests, and confirm user creation flows invoke Better Auth sign-up successfully.
4. Promote to production once staging passes; monitor login telemetry and sign-up webhooks closely during the initial window.
5. Rollback strategy: redeploy the previous Payload build if issues arise and coordinate with Better Auth to invalidate any issued tokens. There is no local-auth fallback.

## Outstanding Decisions
- Decide on the exact tooling/script to backfill `betterAuthUserId` and whether it runs once or remains available for support.
- Agree on JWKS caching policy within Payload (in-memory TTL vs. per-request fetch).
- Define error-handling and alerting when Better Auth sign-up fails during Payload user creation.
- Plan the mechanism to revoke Payload sessions when Better Auth disables an account (webhook vs. scheduled sync).
