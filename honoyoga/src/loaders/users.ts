import { resolveSharedUserById, type SharedLocalUser } from '../../../shared/db/users'

import type { AppDatabase } from '../db/client'

export type AppLoaders = {
  users: {
    byId: {
      load: (id: number) => Promise<SharedLocalUser | null>
    }
  }
}

export const createLoaders = (db: AppDatabase): AppLoaders => {
  const userCache = new Map<number, Promise<SharedLocalUser | null>>()

  return {
    users: {
      byId: {
        load: (id: number) => {
          const cached = userCache.get(id)

          if (cached) {
            return cached
          }

          const promise = resolveSharedUserById(db, id)
          userCache.set(id, promise)

          return promise
        },
      },
    },
  }
}
