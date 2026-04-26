import { createClient } from '@libsql/client'
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql'

import * as schema from './generated/schema'

export type SharedDatabase = LibSQLDatabase<typeof schema>

export type SharedDatabaseOptions = {
  authToken?: string
  url: string
}

const cache = new Map<string, SharedDatabase>()

export const createSharedDatabase = ({ authToken, url }: SharedDatabaseOptions): SharedDatabase => {
  const cacheKey = `${url}::${authToken ?? ''}`
  const cached = cache.get(cacheKey)

  if (cached) {
    return cached
  }

  const client = createClient({
    authToken: authToken || undefined,
    url,
  })

  const db = drizzle({ client, schema })
  cache.set(cacheKey, db)

  return db
}
