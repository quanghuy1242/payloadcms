import { and, eq, like, or, type SQL } from 'drizzle-orm'

import type { SharedLocalUser } from '../db/users'
import { books } from '../db/generated/schema'

export type SharedBookAuth = {
  isAdmin: boolean
  localUser: SharedLocalUser | null
}

const publicPublishedClause = and(eq(books.visibility, 'public'), eq(books.status, 'published'))

const maybeAnd = (...clauses: Array<SQL | undefined>): SQL | undefined => {
  const filtered = clauses.filter((clause): clause is SQL => clause !== undefined)

  if (filtered.length === 0) {
    return undefined
  }

  if (filtered.length === 1) {
    return filtered[0]
  }

  return and(...(filtered as [SQL, SQL, ...SQL[]]))
}

export const buildBookReadClause = (auth: SharedBookAuth): SQL | undefined => {
  if (auth.isAdmin) {
    return undefined
  }

  const clauses: SQL[] = []

  if (publicPublishedClause) {
    clauses.push(publicPublishedClause)
  }

  if (auth.localUser?.id != null) {
    clauses.push(eq(books.createdById, auth.localUser.id))
  }

  return clauses.length === 1 ? clauses[0] : or(...clauses)
}

export const buildBookLookupClause = (lookup: {
  id?: number | null
  slug?: string | null
}): SQL | undefined => {
  const clauses: SQL[] = []

  if (lookup.id != null && Number.isFinite(lookup.id)) {
    clauses.push(eq(books.id, Math.trunc(lookup.id)))
  }

  if (lookup.slug && lookup.slug.trim().length > 0) {
    clauses.push(eq(books.slug, lookup.slug.trim()))
  }

  if (clauses.length === 0) {
    return undefined
  }

  if (clauses.length === 1) {
    return clauses[0]
  }

  return or(...clauses)
}

export const buildBookSearchClause = (search: string | null | undefined): SQL | undefined => {
  if (!search || search.trim().length === 0) {
    return undefined
  }

  const term = `%${search.trim()}%`

  return or(
    eq(books.slug, search.trim()),
    like(books.title, term),
    like(books.author, term),
    like(books.description, term),
  )
}

export const combineBookFilters = (...clauses: Array<SQL | undefined>): SQL | undefined => {
  return maybeAnd(...clauses)
}
