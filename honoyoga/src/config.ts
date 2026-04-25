export type WorkerBindings = {
  AUTH_BASE_URL?: string
  BETTER_AUTH_EXPECTED_AUDIENCE?: string
  BETTER_AUTH_EXPECTED_ISSUER?: string
  APP_NAME?: string
  TURSO_AUTH_TOKEN?: string
  TURSO_DATABASE_URL?: string
}

export const DEFAULT_BETTER_AUTH_TOKEN_COOKIE = 'betterAuthToken'
export const DEFAULT_PAYLOAD_ADMIN_TOKEN_COOKIE = 'payloadAdminToken'

export const DEFAULT_BOOK_LIMIT = 20
export const MAX_BOOK_LIMIT = 50
