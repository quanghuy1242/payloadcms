import {
  GraphQLBoolean,
  GraphQLEnumType,
  GraphQLFieldConfigMap,
  GraphQLFloat,
  GraphQLID,
  GraphQLInt,
  GraphQLList,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLSchema,
  GraphQLString,
  type GraphQLOutputType,
} from 'graphql'
import { getTableColumns } from 'drizzle-orm'

import type { SharedDatabase } from '../db/client'
import type { SharedLocalUser } from '../db/users'
import type { SharedRequestAuth } from '../auth/context'
import { catalog, userTypeFields, userTypeHiddenFields, userTypeTable } from './catalog'
import {
  findEntityByLookup,
  listEntities,
  type EntityDescriptor,
  type EntityFieldType,
} from './repository'

export type SharedGraphQLLoaders = {
  users: {
    byId: {
      load: (id: number) => Promise<SharedLocalUser | null>
    }
  }
}

export type SharedGraphQLContext = {
  auth: SharedRequestAuth
  db: SharedDatabase
  loaders: SharedGraphQLLoaders
  request: Request
}

type ColumnShape = {
  columnType?: string
  dataType?: string
  notNull?: boolean
}

type FieldResolverConfig = {
  resolve?: (...args: any[]) => Promise<unknown> | unknown
  type: GraphQLOutputType
}

const enumTypeCache = new Map<string, GraphQLEnumType>()

const capitalize = (value: string) => {
  if (value.length === 0) {
    return value
  }

  return value[0].toUpperCase() + value.slice(1)
}

const getEnumType = (typeName: string, values: readonly string[]) => {
  const cacheKey = `${typeName}:${values.join('|')}`
  const cached = enumTypeCache.get(cacheKey)

  if (cached) {
    return cached
  }

  const enumType = new GraphQLEnumType({
    name: typeName,
    values: Object.fromEntries(values.map((value) => [value, { value }])),
  })

  enumTypeCache.set(cacheKey, enumType)

  return enumType
}

const resolveScalarType = (
  entityName: string,
  fieldName: string,
  column: ColumnShape,
  fieldType?: EntityFieldType,
  enumValues?: readonly string[],
  forceNullable = false,
): GraphQLOutputType => {
  let type: GraphQLOutputType

  if (fieldType?.kind === 'id') {
    type = GraphQLID
  } else if (fieldType?.kind === 'int') {
    type = GraphQLInt
  } else if (fieldType?.kind === 'float') {
    type = GraphQLFloat
  } else if (fieldType?.kind === 'boolean') {
    type = GraphQLBoolean
  } else if (fieldType?.kind === 'enum' && fieldType.values) {
    type = getEnumType(`${entityName}${capitalize(fieldName)}Enum`, fieldType.values)
  } else if (enumValues) {
    type = getEnumType(`${entityName}${capitalize(fieldName)}Enum`, enumValues)
  } else if (column.dataType === 'number') {
    type = column.columnType?.includes('Numeric') ? GraphQLFloat : GraphQLInt
  } else if (column.dataType === 'boolean') {
    type = GraphQLBoolean
  } else {
    type = GraphQLString
  }

  if (forceNullable) {
    return type
  }

  return column.notNull ? new GraphQLNonNull(type) : type
}

const buildFieldTypeMap = (
  descriptor: EntityDescriptor,
  columns: Record<string, ColumnShape>,
  fieldNames: readonly string[],
) => {
  const args: Record<string, { type: GraphQLOutputType }> = {}

  for (const fieldName of fieldNames) {
    const column = columns[fieldName] ?? {}

    args[fieldName] = {
      type: resolveScalarType(
        descriptor.typeName,
        fieldName,
        column,
        descriptor.fieldTypes?.[fieldName],
        descriptor.enumFields?.[fieldName],
        true,
      ),
    }
  }

  return args
}

const buildLookupArgs = (descriptor: EntityDescriptor) => {
  const columns = getTableColumns(descriptor.table as never) as Record<string, ColumnShape>

  return buildFieldTypeMap(descriptor, columns, descriptor.lookupFields)
}

const buildListArgs = (descriptor: EntityDescriptor) => {
  const columns = getTableColumns(descriptor.table as never) as Record<string, ColumnShape>
  const args: Record<string, { defaultValue?: unknown; type: GraphQLOutputType }> = {
    limit: {
      defaultValue: 20,
      type: GraphQLInt,
    },
    offset: {
      defaultValue: 0,
      type: GraphQLInt,
    },
    search: {
      type: GraphQLString,
    },
    sortBy: {
      type: GraphQLString,
    },
    sortDirection: {
      defaultValue: 'desc',
      type: getEnumType('SortDirection', ['asc', 'desc']),
    },
  }

  for (const [fieldName, fieldConfig] of Object.entries(
    buildFieldTypeMap(descriptor, columns, descriptor.filterFields),
  )) {
    args[fieldName] = fieldConfig
  }

  return args
}

const buildUserType = () => {
  const columns = getTableColumns(userTypeTable as never) as Record<string, ColumnShape>
  const hiddenFields = new Set<string>(userTypeHiddenFields)

  return new GraphQLObjectType({
    name: 'User',
    fields: () => {
      const fields: Record<string, FieldResolverConfig> = {}

      for (const [fieldName, column] of Object.entries(columns)) {
        if (hiddenFields.has(fieldName)) {
          continue
        }

        fields[fieldName] = {
          type: resolveScalarType('User', fieldName, column, userTypeFields[fieldName]),
        }
      }

      return fields
    },
  })
}

const buildRelationResolver = (
  relation: NonNullable<EntityDescriptor['relationFields']>[number],
) => {
  return async (item: Record<string, unknown>, _args: unknown, context: SharedGraphQLContext) => {
    const rawValue = item?.[relation.sourceField]

    if (rawValue == null) {
      return null
    }

    if (relation.targetKey === 'users') {
      const id = typeof rawValue === 'number' ? rawValue : Number(rawValue)

      if (!Number.isFinite(id)) {
        return null
      }

      return context.loaders.users.byId.load(id)
    }

    return null
  }
}

const buildEntityType = (
  descriptor: EntityDescriptor,
  typeRegistry: Map<string, GraphQLObjectType>,
) => {
  const columns = getTableColumns(descriptor.table as never) as Record<string, ColumnShape>
  const hiddenFields = new Set<string>(descriptor.hiddenFields ?? [])

  return new GraphQLObjectType({
    name: descriptor.typeName,
    fields: () => {
      const fields: Record<string, FieldResolverConfig> = {}

      for (const [fieldName, column] of Object.entries(columns)) {
        if (hiddenFields.has(fieldName)) {
          continue
        }

        fields[fieldName] = {
          type: resolveScalarType(
            descriptor.typeName,
            fieldName,
            column,
            descriptor.fieldTypes?.[fieldName],
            descriptor.enumFields?.[fieldName],
          ),
        }
      }

      for (const relation of descriptor.relationFields ?? []) {
        const targetType = typeRegistry.get(relation.typeName)

        if (!targetType) {
          throw new Error(
            `Unknown relation target type "${relation.typeName}" for ${descriptor.typeName}.${relation.fieldName}.`,
          )
        }

        fields[relation.fieldName] = {
          resolve: buildRelationResolver(relation),
          type: targetType,
        }
      }

      return fields
    },
  })
}

const buildPageType = (descriptor: EntityDescriptor, itemType: GraphQLObjectType) => {
  return new GraphQLObjectType({
    name: `${descriptor.typeName}Page`,
    fields: {
      hasMore: { type: new GraphQLNonNull(GraphQLBoolean) },
      items: { type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(itemType))) },
      limit: { type: new GraphQLNonNull(GraphQLInt) },
      offset: { type: new GraphQLNonNull(GraphQLInt) },
      totalCount: { type: new GraphQLNonNull(GraphQLInt) },
    },
  })
}

export const createHonoGraphQLSchema = () => {
  const typeRegistry = new Map<string, GraphQLObjectType>()
  const userType = buildUserType()
  typeRegistry.set('User', userType)

  const entityRuntimes = Object.values(catalog).map((descriptor) => {
    const itemType = buildEntityType(descriptor, typeRegistry)
    typeRegistry.set(descriptor.typeName, itemType)

    return {
      descriptor,
      itemType,
      pageType: buildPageType(descriptor, itemType),
    }
  })

  const queryType = new GraphQLObjectType({
    name: 'Query',
    fields: () => {
      const rootFields: GraphQLFieldConfigMap<unknown, SharedGraphQLContext> = {
        health: {
          resolve: () => 'ok',
          type: new GraphQLNonNull(GraphQLString),
        },
        isAuthenticated: {
          resolve: (_source, _args, context) => context.auth.isAuthenticated,
          type: new GraphQLNonNull(GraphQLBoolean),
        },
        me: {
          resolve: (_source, _args, context) => context.auth.localUser,
          type: userType,
        },
      }

      for (const runtime of entityRuntimes) {
        rootFields[runtime.descriptor.singularQuery] = {
          args: buildLookupArgs(runtime.descriptor) as never,
          resolve: async (_source, args, context) => {
            const lookup: Record<string, unknown> = {}

            for (const fieldName of runtime.descriptor.lookupFields) {
              const value = args[fieldName]

              if (typeof value === 'string' || typeof value === 'number') {
                lookup[fieldName] = value
              }
            }

            return findEntityByLookup(context.db, runtime.descriptor, context.auth, lookup)
          },
          type: runtime.itemType,
        }

        rootFields[runtime.descriptor.pluralQuery] = {
          args: buildListArgs(runtime.descriptor) as never,
          resolve: async (_source, args, context) => {
            return listEntities(context.db, runtime.descriptor, context.auth, {
              ...args,
              limit: typeof args.limit === 'number' ? args.limit : null,
              offset: typeof args.offset === 'number' ? args.offset : null,
              search: typeof args.search === 'string' ? args.search : null,
              sortBy: typeof args.sortBy === 'string' ? args.sortBy : null,
              sortDirection: args.sortDirection === 'asc' ? 'asc' : 'desc',
            })
          },
          type: runtime.pageType,
        }
      }

      return rootFields
    },
  })

  return new GraphQLSchema({
    query: queryType,
    types: [userType, ...entityRuntimes.flatMap((runtime) => [runtime.itemType, runtime.pageType])],
  })
}
