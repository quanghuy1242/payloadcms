import { eq, or } from 'drizzle-orm'

import type { BetterAuthClaims } from '../auth/tokens'
import { users } from './generated/schema'
import type { SharedDatabase } from './client'

export type SharedLocalUser = {
  betterAuthUserId: string | null
  email: string
  fullName: string
  id: number
  role: 'admin' | 'user'
}

const normalizeSharedUserRole = (value: string | null | undefined): 'admin' | 'user' => {
  return value === 'admin' ? 'admin' : 'user'
}

export const loadSharedLocalUserProjection = async (
  db: SharedDatabase,
  claims: BetterAuthClaims,
): Promise<SharedLocalUser | null> => {
  const conditions = [eq(users.betterAuthUserId, claims.sub)]

  if (claims.email) {
    conditions.push(eq(users.email, claims.email))
  }

  const where = conditions.length === 1 ? conditions[0] : or(...conditions)

  const rows = await db
    .select({
      betterAuthUserId: users.betterAuthUserId,
      email: users.email,
      fullName: users.fullName,
      id: users.id,
      role: users.role,
    })
    .from(users)
    .where(where)
    .limit(1)

  if (rows.length === 0) {
    return null
  }

  const row = rows[0]

  return {
    betterAuthUserId: row.betterAuthUserId ?? null,
    email: row.email,
    fullName: row.fullName,
    id: row.id,
    role: normalizeSharedUserRole(row.role),
  }
}

export const resolveSharedUserById = async (
  db: SharedDatabase,
  id: number,
): Promise<SharedLocalUser | null> => {
  const rows = await db
    .select({
      betterAuthUserId: users.betterAuthUserId,
      email: users.email,
      fullName: users.fullName,
      id: users.id,
      role: users.role,
    })
    .from(users)
    .where(eq(users.id, id))
    .limit(1)

  if (rows.length === 0) {
    return null
  }

  const row = rows[0]

  return {
    betterAuthUserId: row.betterAuthUserId ?? null,
    email: row.email,
    fullName: row.fullName,
    id: row.id,
    role: normalizeSharedUserRole(row.role),
  }
}
