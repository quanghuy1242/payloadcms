# GraphQL Best Practices

## Directory Structure

Follow PayloadCMS best practices by organizing GraphQL extensions in a dedicated `graphql` directory:

```
src/graphql/
├── index.ts              # Main export file
├── queries/
│   ├── index.ts          # Queries aggregator
│   └── SimilarPosts/
│       ├── index.ts      # Query definition
│       └── resolver.ts   # Resolver logic
└── mutations/
    ├── index.ts          # Mutations aggregator (future)
    └── [MutationName]/
        ├── index.ts      # Mutation definition
        └── resolver.ts   # Resolver logic
```

## Creating a New Query

### 1. Create the Resolver

**File:** `src/graphql/queries/[QueryName]/resolver.ts`

```typescript
import type { Payload } from 'payload'

interface QueryArgs {
  // Define your arguments
}

export const queryNameResolver = async (
  _: any,
  args: QueryArgs,
  context: any,
): Promise<any> => {
  const payload: Payload = context.req.payload
  
  // Your resolver logic here
  
  return result
}
```

### 2. Define the Query

**File:** `src/graphql/queries/[QueryName]/index.ts`

```typescript
import type { GraphQLFieldConfig } from 'graphql'
import { queryNameResolver } from './resolver'

export const QueryName = (GraphQL: any, payload: any): GraphQLFieldConfig<any, any> => {
  return {
    type: new GraphQL.GraphQLObjectType({
      name: 'QueryNameResult',
      fields: {
        // Define your return type fields
      },
    }),
    args: {
      // Define your arguments
    },
    resolve: queryNameResolver,
  }
}
```

### 3. Register the Query

**File:** `src/graphql/queries/index.ts`

```typescript
import { SimilarPosts } from './SimilarPosts'
import { QueryName } from './QueryName'

export const queries = (GraphQL: any, payload: any) => {
  return {
    SimilarPosts: SimilarPosts(GraphQL, payload),
    QueryName: QueryName(GraphQL, payload),
    // Add more queries here
  }
}
```

### 4. Export from Main Index

**File:** `src/graphql/index.ts`

```typescript
import { queries } from './queries'
// import { mutations } from './mutations' // When ready

export { queries }
// export { mutations } // When ready
```

### 5. Use in Payload Config

**File:** `src/payload.config.ts`

```typescript
import { queries } from './graphql'

export default buildConfig({
  // ...
  graphQL: {
    disablePlaygroundInProduction: false,
    queries,
    // mutations, // When ready
  },
})
```

## Creating a New Mutation

Follow the same pattern as queries, but in the `mutations` directory:

**File:** `src/graphql/mutations/[MutationName]/resolver.ts`

```typescript
import type { Payload } from 'payload'

interface MutationArgs {
  // Define your arguments
}

export const mutationNameResolver = async (
  _: any,
  args: MutationArgs,
  context: any,
): Promise<any> => {
  const payload: Payload = context.req.payload
  
  // Your mutation logic here
  
  return result
}
```

**File:** `src/graphql/mutations/[MutationName]/index.ts`

```typescript
import type { GraphQLFieldConfig } from 'graphql'
import { mutationNameResolver } from './resolver'

export const MutationName = (GraphQL: any, payload: any): GraphQLFieldConfig<any, any> => {
  return {
    type: new GraphQL.GraphQLObjectType({
      name: 'MutationNameResult',
      fields: {
        // Define your return type fields
      },
    }),
    args: {
      // Define your arguments
    },
    resolve: mutationNameResolver,
  }
}
```

## Best Practices

### ✅ DO

- **Separate concerns**: Keep resolver logic separate from query/mutation definitions
- **Use TypeScript**: Define interfaces for arguments and return types
- **Extract payload**: Always get `payload` from `context.req.payload` in resolvers
- **Organize by feature**: Group related files in their own directory
- **Reuse types**: Reference existing collection types when possible
- **Document**: Add JSDoc comments for complex logic

### ❌ DON'T

- **Inline logic**: Never put resolver logic directly in `payload.config.ts`
- **Mix concerns**: Don't combine query definitions with resolver logic
- **Ignore types**: Always type your arguments and return values
- **Hardcode**: Use payload's type system instead of hardcoding GraphQL types

## Example: Current Implementation

The `SimilarPosts` query follows this structure:

```
src/graphql/
├── index.ts                          # Exports queries
├── queries/
│   ├── index.ts                      # Aggregates all queries
│   └── SimilarPosts/
│       ├── index.ts                  # Query definition & type
│       └── resolver.ts               # Scoring & recommendation logic
```

This keeps the codebase:
- **Maintainable**: Easy to find and modify
- **Testable**: Resolvers can be unit tested independently
- **Scalable**: Adding new queries is straightforward
- **Clean**: `payload.config.ts` stays concise

## Accessing Payload Types

When defining return types, reference existing collection types:

```typescript
export const QueryName = (GraphQL: any, payload: any): GraphQLFieldConfig<any, any> => {
  // Access existing types
  const postsType = payload.collections['posts'].graphQL?.type
  const usersType = payload.collections['users'].graphQL?.type
  
  return {
    type: new GraphQL.GraphQLObjectType({
      name: 'QueryResult',
      fields: {
        posts: { type: new GraphQL.GraphQLList(postsType) },
        user: { type: usersType },
      },
    }),
    // ...
  }
}
```

## Testing Your Queries

1. Start dev server: `pnpm dev`
2. Navigate to: `http://localhost:3000/api/graphql-playground`
3. Test your query with the GraphQL Playground

## References

- [PayloadCMS GraphQL Docs](https://payloadcms.com/docs/graphql/overview)
- [PayloadCMS Extending GraphQL](https://payloadcms.com/docs/graphql/extending)
