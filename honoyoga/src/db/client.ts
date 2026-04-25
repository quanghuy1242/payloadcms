import { createSharedDatabase, type SharedDatabase } from '../../../shared/db/client'

import type { WorkerBindings } from '../config'

export type AppDatabase = SharedDatabase

export const getDatabase = (env: WorkerBindings): AppDatabase => {
  const url = env.TURSO_DATABASE_URL

  if (!url) {
    throw new Error('TURSO_DATABASE_URL is required for the Hono GraphQL worker.')
  }

  return createSharedDatabase({
    authToken: env.TURSO_AUTH_TOKEN,
    url,
  })
}
