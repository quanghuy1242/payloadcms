import { and, desc, eq, or, sql, type SQL } from 'drizzle-orm'

import type { SharedBookAuth } from '../policies/books'

type EntityTable = any

export type EntityFieldKind = 'id' | 'int' | 'float' | 'boolean' | 'string' | 'enum'

export type EntityFieldType = {
  kind: EntityFieldKind
  values?: readonly string[]
}

export type EntityRelationDescriptor = {
  fieldName: string
  sourceField: string
  targetKey: string
  typeName: string
}

export type EntityDescriptor = {
  access: (auth: SharedBookAuth) => SQL | undefined
  defaultSortFields: readonly string[]
  enumFields?: Record<string, readonly string[]>
  filterFields: readonly string[]
  fieldTypes?: Record<string, EntityFieldType>
  hiddenFields?: readonly string[]
  key: string
  lookupFields: readonly string[]
  pluralQuery: string
  relationFields?: readonly EntityRelationDescriptor[]
  searchFields?: readonly string[]
  singularQuery: string
  sortFields: readonly string[]
  table: EntityTable
  typeName: string
}

export type EntityLookup = Record<string, unknown>

export type EntityListArgs = {
  limit?: number | null
  offset?: number | null
  search?: string | null
  sortBy?: string | null
  sortDirection?: 'asc' | 'desc' | null
} & Record<string, unknown>

export type EntityPage<TItem> = {
  hasMore: boolean
  items: TItem[]
  limit: number
  offset: number
  totalCount: number
}

const normalizeLookupValue = (value: unknown): string | number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value)
  }

  if (typeof value === 'string') {
    const normalized = value.trim()

    if (normalized.length === 0) {
      return null
    }

    const numeric = Number(normalized)

    if (!Number.isNaN(numeric) && String(numeric) === normalized) {
      return numeric
    }

    return normalized
  }

  return null
}

export const buildEntityLookupClause = (
  descriptor: EntityDescriptor,
  lookup: EntityLookup,
): SQL | undefined => {
  const clauses: SQL[] = []

  for (const field of descriptor.lookupFields) {
    const normalized = normalizeLookupValue(lookup[field])

    if (normalized == null) {
      continue
    }

    clauses.push(eq((descriptor.table as Record<string, any>)[field], normalized))
  }

  if (clauses.length === 0) {
    return undefined
  }

  if (clauses.length === 1) {
    return clauses[0]
  }

  return and(...clauses)
}

export const buildEntityFilterClause = (
  descriptor: EntityDescriptor,
  args: EntityListArgs,
): SQL | undefined => {
  const clauses: SQL[] = []

  if (args.search && descriptor.searchFields && descriptor.searchFields.length > 0) {
    const term = `%${args.search.trim()}%`
    const searchClauses = descriptor.searchFields
      .map((field) => {
        const column = (descriptor.table as Record<string, any>)[field]

        return typeof column === 'undefined' ? undefined : sql`${column} like ${term}`
      })
      .filter((clause): clause is SQL => clause !== undefined)

    if (searchClauses.length > 0) {
      const searchClause = searchClauses.length === 1 ? searchClauses[0] : and(...searchClauses)

      if (searchClause) {
        clauses.push(searchClause)
      }
    }
  }

  for (const field of descriptor.filterFields) {
    const value = args[field]

    if (value === undefined || value === null || value === '') {
      continue
    }

    clauses.push(eq((descriptor.table as Record<string, any>)[field], value as never))
  }

  if (clauses.length === 0) {
    return undefined
  }

  if (clauses.length === 1) {
    return clauses[0]
  }

  return and(...clauses)
}

export const resolveEntityOrder = (descriptor: EntityDescriptor, args: EntityListArgs) => {
  const sortBy =
    args.sortBy && descriptor.sortFields.includes(args.sortBy)
      ? args.sortBy
      : descriptor.defaultSortFields[0]
  const sortDirection = args.sortDirection === 'asc' ? 'asc' : 'desc'

  const orderFields = [sortBy, ...descriptor.defaultSortFields.filter((field) => field !== sortBy)]

  return orderFields.map((field) => {
    const column = (descriptor.table as Record<string, any>)[field]

    return sortDirection === 'asc' ? column : desc(column)
  })
}

export const findEntityByLookup = async <TItem>(
  db: any,
  descriptor: EntityDescriptor,
  auth: SharedBookAuth,
  lookup: EntityLookup,
): Promise<TItem | null> => {
  const accessClause = descriptor.access(auth)
  const lookupClause = buildEntityLookupClause(descriptor, lookup)

  if (!lookupClause) {
    return null
  }

  const where = accessClause ? and(accessClause, lookupClause) : lookupClause
  const rows = await db.select().from(descriptor.table).where(where).limit(1)

  return rows[0] ?? null
}

export const listEntities = async <TItem>(
  db: any,
  descriptor: EntityDescriptor,
  auth: SharedBookAuth,
  args: EntityListArgs,
): Promise<EntityPage<TItem>> => {
  const accessClause = descriptor.access(auth)
  const filterClause = buildEntityFilterClause(descriptor, args)
  const clauses = [accessClause, filterClause].filter(Boolean) as SQL[]
  const where =
    clauses.length === 0 ? undefined : clauses.length === 1 ? clauses[0] : and(...clauses)
  const limit = Math.max(1, Math.min(100, Number(args.limit ?? 20)))
  const offset = Math.max(0, Number(args.offset ?? 0))

  const countQuery = await db
    .select({
      totalCount: sql<number>`count(*)`,
    })
    .from(descriptor.table)
    .where(where)

  const totalCount = Number(countQuery[0]?.totalCount ?? 0)
  const rows = await db
    .select()
    .from(descriptor.table)
    .where(where)
    .orderBy(...resolveEntityOrder(descriptor, args))
    .limit(limit)
    .offset(offset)

  return {
    hasMore: offset + rows.length < totalCount,
    items: rows as TItem[],
    limit,
    offset,
    totalCount,
  }
}
