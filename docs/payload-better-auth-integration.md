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
- **Dependencies installed**: `jose` for JWT verification (JWKS validation).
- **Configuration** (`src/payload.config.ts`):
  - Custom login UI via `components.beforeLogin` pointing to `BetterAuthLoginRedirect.tsx`
  - Logout button override via `components.logout.Button` pointing to `BetterAuthLogout.tsx`
  - No Express middleware needed (Next.js App Router handles authentication via API routes)
- **Environment Variables**:
  - `AUTH_BASE_URL`: Better Auth service origin
  - `PAYLOAD_CLIENT_ID`: OAuth2 client ID
  - `PAYLOAD_CLIENT_SECRET`: OAuth2 client secret
  - `PAYLOAD_REDIRECT_URI`: OAuth2 callback URL (e.g., `https://cms.example.com/auth/callback`)
  - Optional: `BETTER_AUTH_EXPECTED_ISSUER`, `BETTER_AUTH_EXPECTED_AUDIENCE` for JWT validation

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

### 3. OAuth2 Flow & API Routes
**No Express middleware needed**—Next.js App Router handles authentication via dedicated API routes.

#### PKCE Implementation (`src/lib/betterAuth/pkce.ts`)
- Generates 64-byte random verifier (base64url encoded)
- Computes SHA-256 challenge from verifier
- Cookie payload: `{ state, verifier, createdAt }` (base64url JSON, 10min TTL)

#### Authorize URL Generation (`/api/auth/url`)
**Location**: `src/app/(payload)/api/auth/url/route.ts`

**Process**:
1. Calls `createAuthorizeUrl()` which:
   - Generates random `state` (UUID)
   - Creates PKCE pair (`verifier`, `challenge`)
   - Builds authorize URL to `<AUTH_BASE_URL>/api/auth/oauth2/authorize` with:
     - `client_id`: PayloadCMS OAuth2 client
     - `redirect_uri`: Callback URL
     - `response_type`: `code`
     - `scope`: `openid email profile`
     - `state`: CSRF token
     - `code_challenge`: PKCE challenge
     - `code_challenge_method`: `S256`
2. Stores PKCE state in `betterAuthState` cookie (HttpOnly, Secure, SameSite=Lax, 10min)
3. Returns `{ authorizeURL }` to client

#### OAuth2 Callback (`/auth/callback`)
**Location**: `src/app/(payload)/auth/callback/route.ts`

**Process**:
1. Extracts `code`, `state`, `error` from query params
2. Validates CSRF `state` against stored PKCE cookie
3. Checks for existing session (prevents reusing old OAuth flow)
4. Exchanges authorization code for tokens via `POST <AUTH_BASE_URL>/api/auth/oauth2/token`:
   - **Headers**: `Authorization: Basic <base64(clientId:clientSecret)>`
   - **Body** (form-urlencoded):
     - `grant_type`: `authorization_code`
     - `code`: Authorization code
     - `redirect_uri`: Must match authorize request
     - `code_verifier`: From PKCE cookie
5. Extracts `id_token` from response (JWT)
6. Sets two cookies (both HttpOnly, Secure, SameSite=Lax, expiry from token):
   - `betterAuthToken`: ID token
   - `payloadAdminToken`: Same ID token (legacy compatibility)
7. Clears PKCE cookie
8. Redirects to `/admin`

**Error Handling**: Redirects to `/admin?error=<code>` for various failure scenarios

### 4. Admin UI Components
#### Login Redirect (`BetterAuthLoginRedirect.tsx`)
**Location**: `src/components/admin/BetterAuthLoginRedirect.tsx`

**Configured as**: `components.beforeLogin`

**Behavior**:
1. On mount, fetches `/api/auth/url` to get authorize URL
2. Redirects browser to Better Auth sign-in page
3. Displays loading state with retry on error

#### Logout Button (`BetterAuthLogout.tsx`)
**Location**: `src/components/admin/BetterAuthLogout.tsx`

**Configured as**: `components.logout.Button` (overrides built-in Payload logout)

**Behavior**:
1. Calls `POST /api/auth/logout` which:
   - Clears PayloadCMS cookies (`betterAuthToken`, `payloadAdminToken`)
   - Returns `{ logoutUrl }` pointing to `/auth/logout-redirect`
2. Redirects to logout-redirect page which:
   - POSTs to `<AUTH_BASE_URL>/api/auth/sign-out` with `credentials: 'include'`
   - Sends empty JSON body: `{}`
   - Better Auth clears its session cookies
3. Finally redirects to `/admin?loggedOut=1`

**Result**: Single logout button in account menu (no duplicate buttons)

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

## Authentication Flow (Detailed Implementation)
### Admin / SSR (Confidential Client - OAuth2 + PKCE)

#### 1. Initial Admin Access (Unauthenticated)
**User navigates to** `/admin`

**PayloadCMS checks authentication**:
- `betterAuthStrategy.authenticate()` extracts token from:
  - `Authorization: Bearer <token>` header, OR
  - `betterAuthToken` cookie, OR
  - `payloadAdminToken` cookie
- No valid token found → Shows login screen

#### 2. Login Flow Initiation
**Login screen renders** `BetterAuthLoginRedirect` component

**Component behavior**:
1. On mount, fetches `GET /api/auth/url`
2. Server generates PKCE pair:
   - `verifier`: 64-byte random value (base64url)
   - `challenge`: SHA-256 hash of verifier (base64url)
   - `state`: Random UUID for CSRF protection
3. Server creates cookie payload: `{ state, verifier, createdAt }`
4. Server stores in **`betterAuthState` cookie**:
   - Value: Base64url-encoded JSON payload
   - HttpOnly: `true`
   - Secure: `true` (production) / `false` (dev)
   - SameSite: `'lax'`
   - Path: `/`
   - Max-Age: `600` seconds (10 minutes)
5. Server builds authorize URL:
   ```
   <AUTH_BASE_URL>/api/auth/oauth2/authorize?
     client_id=<PAYLOAD_CLIENT_ID>
     &redirect_uri=<PAYLOAD_REDIRECT_URI>
     &response_type=code
     &scope=openid email profile
     &state=<UUID>
     &code_challenge=<SHA256_HASH>
     &code_challenge_method=S256
   ```
6. Server returns `{ authorizeURL }` to client
7. Client redirects browser to authorize URL

#### 3. Better Auth Authentication
**User sees Better Auth sign-in page** at `<AUTH_BASE_URL>/sign-in`

**Better Auth processes authentication**:
1. User enters credentials
2. Better Auth validates credentials
3. Better Auth creates session in its own database
4. Better Auth sets its own session cookie (domain: `auth.quanghuy.dev`)
5. Better Auth redirects to callback URL with:
   - `code`: Authorization code (single-use, short-lived)
   - `state`: Same UUID from authorize request

**Redirect location**: `<PAYLOAD_REDIRECT_URI>/auth/callback?code=xxx&state=xxx`

#### 4. OAuth2 Callback & Token Exchange
**PayloadCMS callback route** at `/auth/callback` receives request

**Step-by-step processing**:

1. **Extract parameters**:
   - `code` from query string
   - `state` from query string
   - `error` from query string (if present)

2. **Error handling**:
   - If `error` present → Redirect to `/admin?error=<error>`
   - If `code` or `state` missing → Redirect to `/admin?error=missing_code`

3. **Prevent session replay**:
   - Check for existing `betterAuthToken` cookie
   - If found → User already authenticated
   - Clear PKCE cookie and redirect to `/admin`
   - This prevents reusing old authorization codes

4. **CSRF validation**:
   - Read `betterAuthState` cookie
   - Decode base64url JSON payload
   - Extract stored `state` and `verifier`
   - Compare stored `state` with query param `state`
   - Check cookie age (must be < 10 minutes)
   - If validation fails → Redirect to `/admin?error=invalid_state`

5. **Token exchange** via `POST <AUTH_BASE_URL>/api/auth/oauth2/token`:
   
   **Request headers**:
   - `Content-Type: application/x-www-form-urlencoded`
   - `Authorization: Basic <base64(clientId:clientSecret)>`
   
   **Request body** (form-urlencoded):
   - `grant_type=authorization_code`
   - `code=<authorization_code>`
   - `redirect_uri=<PAYLOAD_REDIRECT_URI>` (must match authorize request)
   - `code_verifier=<pkce_verifier>` (from cookie)
   
   **Response** (JSON):
   ```json
   {
     "access_token": "...",
     "id_token": "eyJhbGc...",  // JWT - THIS IS WHAT WE USE
     "token_type": "Bearer",
     "expires_in": 3600
   }
   ```

6. **Extract ID token**:
   - Response contains both `access_token` and `id_token`
   - **We use `id_token`** (JWT containing user claims)
   - `access_token` is ignored (Better Auth specific)
   - If `id_token` missing → Redirect to `/admin?error=missing_id_token`

7. **Set authentication cookies** (both set to `id_token` value):
   
   **`betterAuthToken` cookie** (primary):
   - Value: `id_token` JWT
   - HttpOnly: `true`
   - Secure: `true` (production) / `false` (dev)
   - SameSite: `'lax'`
   - Path: `/`
   - Max-Age: `expires_in` from token response (typically 3600s / 1 hour)
   
   **`payloadAdminToken` cookie** (legacy compatibility):
   - Same settings as `betterAuthToken`
   - Same value (duplicate for backward compatibility)

8. **Clean up PKCE state**:
   - Set `betterAuthState` cookie to empty string
   - Set Max-Age: `0` (immediate expiry)
   - This clears the PKCE verifier and state

9. **Set cache headers**:
   - `Cache-Control: no-store` (prevent caching of redirect response)

10. **Redirect to admin panel**:
    - Location: `/admin`
    - User now has authenticated session

#### 5. Authenticated Requests
**Every subsequent request to PayloadCMS**:

1. **Token extraction** (`extractTokenFromHeaders`):
   - Check `Authorization: Bearer <token>` header first
   - If not found, parse `Cookie` header for:
     - `betterAuthToken` cookie, OR
     - `payloadAdminToken` cookie
   - Decode URL-encoded cookie value

2. **JWT verification** (`verifyBetterAuthToken`):
   - Fetch JWKS (JSON Web Key Set) from `<AUTH_BASE_URL>/api/auth/jwks`
   - JWKS cached at module level (singleton, persists for process lifetime)
   - Verify JWT signature using public keys from JWKS
   - Validate claims:
     - `iss` (issuer): Must match `BETTER_AUTH_EXPECTED_ISSUER` or `AUTH_BASE_URL`
     - `aud` (audience): Must match `BETTER_AUTH_EXPECTED_AUDIENCE` (if set)
     - `exp` (expiration): Must be in the future
   - Extract payload:
     ```json
     {
       "sub": "better-auth-user-id",
       "email": "user@example.com",
       "name": "User Name",
       "roles": ["admin"],  // optional
       "iat": 1234567890,
       "exp": 1234571490
     }
     ```

3. **User upsert** (`upsertBetterAuthUser`):
   - Query PayloadCMS database for user by `betterAuthUserId` (token `sub`)
   - If not found, query by `email`
   - If still not found, **create new user**:
     - `email`: from token
     - `fullName`: from token `name` or fallback to email
     - `role`: `'admin'` if token has `roles: ['admin']`, else `'user'`
     - `betterAuthUserId`: from token `sub`
   - If found, **update user** (only empty fields):
     - Update `email` if missing in database
     - Update `fullName` if empty in database
     - Update `betterAuthUserId` if missing in database
     - **Promote to admin** if token has `roles: ['admin']` and user is currently `'user'`
     - **Never downgrade** from admin to user

4. **Return authenticated user**:
   ```typescript
   {
     user: {
       collection: 'users',
       _strategy: 'better-auth',
       id: 123,
       email: 'user@example.com',
       fullName: 'User Name',
       role: 'admin',
       betterAuthUserId: 'better-auth-user-id',
       // ... other user fields
     }
   }
   ```

5. **Request proceeds** with authenticated user context

#### 6. Token Expiration
**When ID token expires** (typically after 1 hour):

1. JWT verification fails with `JWTExpired` error
2. `betterAuthStrategy.authenticate()` returns `{ user: null }`
3. PayloadCMS admin UI detects unauthenticated state
4. Shows login screen
5. User must complete OAuth flow again (steps 2-4)
6. **No refresh token support** (requires full re-authentication)

#### 7. Logout Flow
**User clicks logout button** in PayloadCMS account menu

**Step 1 - Client calls logout API**:
- Button component calls `POST /api/auth/logout`
- Receives response: `{ success: true, logoutUrl: '/auth/logout-redirect?...' }`

**Step 2 - Server clears PayloadCMS cookies** (`/api/auth/logout`):
- Creates response with `Set-Cookie` headers:
  - `betterAuthToken=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=lax`
  - `payloadAdminToken=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=lax`
- Returns logout redirect URL with query params:
  - `authBaseUrl`: Better Auth service URL
  - `returnUrl`: Final redirect destination (`/admin?loggedOut=1`)

**Step 3 - Client redirects to logout page**:
- Browser navigates to `/auth/logout-redirect?authBaseUrl=...&returnUrl=...`
- Shows "Signing out..." message

**Step 4 - Logout page clears Better Auth session**:
1. Extracts `authBaseUrl` and `returnUrl` from query params
2. POSTs to Better Auth sign-out endpoint:
   ```javascript
   fetch(`${authBaseUrl}/api/auth/sign-out`, {
     method: 'POST',
     credentials: 'include',  // Send Better Auth cookies
     headers: { 'Content-Type': 'application/json' },
     body: JSON.stringify({})  // Empty JSON body
   })
   ```
3. Better Auth responds with `Set-Cookie` headers to clear its session:
   - Better Auth session cookie set to empty with Max-Age=0
   - Domain: `auth.quanghuy.dev`
4. Client redirects to `returnUrl` (`/admin?loggedOut=1`)

**Step 5 - User sees logged out state**:
- PayloadCMS shows login screen
- Query param `?loggedOut=1` can display "Successfully logged out" message
- All sessions cleared on both PayloadCMS and Better Auth

**Key Points**:
- **Two separate cookie domains**: PayloadCMS cookies vs Better Auth cookies
- **Client-side Better Auth sign-out**: Required because cookies are HttpOnly (can't clear from server)
- **Graceful error handling**: Redirects even if Better Auth sign-out fails
- **No token revocation API**: Tokens remain valid until expiry (no early invalidation)

### SPA / Public Client (Future Implementation)
**Status**: Not yet implemented in current codebase. The architecture supports this via the existing `betterAuthStrategy`.

**Planned Flow**:
1. SPA uses `authClient.oidc.signIn()` (PKCE flow without client secret)
2. Better Auth redirects back with authorization code
3. SPA exchanges code for tokens (public client flow)
4. Tokens stored client-side (memory/IndexedDB)
5. API calls to Payload include `Authorization: Bearer <access_token>`
6. Payload validates token via JWKS (same strategy as admin flow)

**Current Admin Strategy Supports**:
- Bearer tokens in `Authorization` header
- JWKS-based validation (no client-specific logic)
- Token claim extraction (email, name, roles)
- Automatic user provisioning/updates

## Deployment Strategy
- **Environments**: Production uses Better Auth at `auth.quanghuy.dev` and PayloadCMS at your chosen domain
- **Environment Variables** (all required):
  - `AUTH_BASE_URL`: Better Auth service origin (e.g., `https://auth.quanghuy.dev`)
  - `PAYLOAD_CLIENT_ID`: OAuth2 client ID from Better Auth
  - `PAYLOAD_CLIENT_SECRET`: OAuth2 client secret from Better Auth
  - `PAYLOAD_REDIRECT_URI`: OAuth2 callback URL (e.g., `https://cms.example.com/auth/callback`)
  - Optional: `BETTER_AUTH_EXPECTED_ISSUER`, `BETTER_AUTH_EXPECTED_AUDIENCE` for stricter JWT validation
- **Cookie Configuration**:
  - Production: `Secure: true`, `SameSite: 'lax'`, `HttpOnly: true`
  - Development: `Secure: false` (localhost compatibility)
- **CORS**: Not needed for cookie-based admin flow (same-origin after OAuth redirect)
- **Database**: PayloadCMS stores users with `betterAuthUserId` linking to Better Auth accounts
- **No local auth fallback**: All authentication flows through Better Auth (enforced by `disableLocalStrategy: true`)

## Testing & Validation
- **Unit Tests**: Token validation, PKCE pair generation, cookie parsing
- **Integration Tests**: Via `tests/int/api.int.spec.ts` (Vitest)
  - User creation triggers Better Auth sign-up
  - JWT verification against JWKS
  - User upsert logic (email matching, role mapping)
- **E2E Tests**: Via `tests/e2e/frontend.e2e.spec.ts` (Playwright)
  - Full OAuth flow: login → redirect → callback → admin access
  - Logout clears both Payload and Better Auth sessions
- **Security Validations**:
  - ✅ CSRF protection via `state` parameter
  - ✅ PKCE prevents authorization code interception
  - ✅ JWT signature validation via JWKS
  - ✅ HttpOnly cookies prevent XSS token theft
  - ✅ SameSite=Lax prevents CSRF attacks
- **Monitoring**: Log authentication events, track token expiry rates, alert on sign-up failures

## Testing & Validation
- **Unit**: Token validation helpers (mock JWKS), middleware behavior, and the user creation hook that calls Better Auth sign-up (stub HTTP client).
- **Integration**: Playwright tests executing the full admin redirect flow against staging Better Auth + Payload.
- **SPA**: Cypress/Playwright tests covering PKCE generation, callback handling, silent token refresh, and logout across tabs.
- **Security**: Perform JWT tampering tests, ensure CSRF `state` validation, check cookie flags (Secure, HttpOnly).
- **Load**: Simulate concurrent logins to confirm Better Auth/Turso capacity and Payload PKCE storage resilience.
- **Monitoring**: Use synthetic checks on `/admin` to ensure redirect + callback chain stays healthy.

## Security & Compliance Considerations
- **JWT Validation**: JWKS endpoint cached at module level (persists for process lifetime)
  - ⚠️ **Action Item**: Implement TTL-based JWKS refresh (recommended: hourly)
- **Token Expiry**: Handled by JWT `exp` claim validation
  - No refresh token support yet (requires re-authentication on expiry)
- **Session Revocation**: Not implemented
  - ⚠️ **Action Item**: Add webhook listener for Better Auth account disable/delete events
- **Audit Logging**: Basic authentication events logged via Payload logger
  - ⚠️ **Action Item**: Add comprehensive audit trail (IP, user agent, timestamp)
- **MFA Enforcement**: Handled by Better Auth
  - Policy enforcement happens at Better Auth level
  - PayloadCMS trusts tokens from successfully authenticated sessions
- **Scope Minimization**: Tokens contain only essential claims:
  - `sub` (Better Auth user ID)
  - `email`, `name` (profile info)
  - Optional: `roles` (for admin promotion)
- **Data Privacy**:
  - `betterAuthUserId` is read-only and immutable after creation
  - Email synchronization happens only on user creation/first login
  - No sensitive Better Auth data stored in PayloadCMS
- **Cookie Security**:
  - ✅ `HttpOnly: true` prevents JavaScript access
  - ✅ `Secure: true` in production (HTTPS only)
  - ✅ `SameSite: 'lax'` prevents CSRF while allowing OAuth redirects
  - ✅ 10-minute TTL for PKCE cookies (ephemeral)
- **Client Secret Protection**: Stored in environment variables, never exposed to client

## Rollout & Migration Plan
✅ **Completed**: Integration is live and operational

### Backfilling Existing Users
**Status**: Manual process available via admin panel

**For existing Payload users without `betterAuthUserId`**:
1. Admin creates corresponding Better Auth account manually
2. Admin updates Payload user record with Better Auth user ID
3. User can then log in via OAuth flow

**Automated Script** (not yet implemented):
```bash
# Proposed utility to backfill existing users
pnpm backfill:better-auth --dry-run  # Preview changes
pnpm backfill:better-auth --execute   # Apply changes
```

Would:
- Query Payload users where `betterAuthUserId` is null
- Call Better Auth sign-up API for each user
- Update Payload records with returned IDs
- Handle duplicates gracefully (email collision)

### Current Production State
- ✅ OAuth2 + PKCE flow working
- ✅ User creation provisions Better Auth accounts
- ✅ JWT validation via JWKS
- ✅ Logout clears both sessions
- ✅ No local auth fallback (Better Auth required)

### Rollback Strategy
**If critical issues arise**:
1. Revert to previous commit
2. Redeploy PayloadCMS
3. Better Auth tokens issued before rollback remain valid until expiry
4. No data migration needed (backward compatible schema)

## Implementation Status & Notes

### Completed Features
- ✅ OAuth2 + PKCE authorization flow
- ✅ JWT verification via JWKS endpoint
- ✅ Automatic user provisioning (Better Auth sign-up on Payload user creation)
- ✅ User upsert logic (links existing users by email)
- ✅ Role mapping from token claims (admin promotion support)
- ✅ Cookie-based session management (HttpOnly, Secure, SameSite=Lax)
- ✅ CSRF protection via state parameter
- ✅ Logout flow (clears both Payload and Better Auth sessions)
- ✅ Admin UI overrides (custom login/logout components)

### Current Implementation Details
- **JWKS Caching**: Module-level singleton (`cachedJwks`), persists for process lifetime
- **Token Extraction**: Checks both `Authorization: Bearer` header and cookies
- **Cookie Names**: `betterAuthToken` (primary), `payloadAdminToken` (legacy compat)
- **PKCE Storage**: Encrypted cookie with 10-minute TTL
- **Error Handling**: Redirects to `/admin?error=<code>` on OAuth failures
- **User Creation**: Throws `BetterAuthUserExistsError` if email collision detected

### Known Limitations
- No automatic JWKS rotation (requires process restart)
- No session revocation mechanism (token remains valid until expiry)
- No refresh token support (requires re-authentication on expiry)
- SPA public client flow not implemented

### Future Enhancements
- Implement JWKS cache with TTL (hourly refresh)
- Add webhook listener for Better Auth account disable/delete events
- Support refresh token flow for longer sessions
- Implement SPA client library integration
- Add session activity logging and audit trail
