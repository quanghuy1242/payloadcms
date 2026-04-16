# GraphQL Query Scaffold Example: `BookChapters`

## Folder structure created

```
src/graphql/queries/BookChapters/
├── index.ts      # GraphQLFieldConfig
└── resolver.ts   # Query logic
```

## resolver.ts

```typescript
import type { Payload } from 'payload'

type Args = { bookId: string; limit?: number }

export const bookChaptersResolver = async (_: unknown, args: Args, context: any) => {
  const payload: Payload = context.req.payload
  return payload.find({
    collection: 'chapters',
    where: { book: { equals: args.bookId } },
    limit: args.limit ?? 20,
  })
}
```

## index.ts

```typescript
import type { GraphQLFieldConfig } from 'graphql'
import { bookChaptersResolver } from './resolver'

export const BookChapters = (GraphQL: any, payload: any): GraphQLFieldConfig<any, any> => ({
  type: payload.collections['chapters'].graphQL?.type,
  args: {
    bookId: { type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLString) },
    limit: { type: GraphQL.GraphQLInt },
  },
  resolve: bookChaptersResolver,
})
```

## Registration in `src/graphql/queries/index.ts`

```typescript
export const queries = (GraphQL: any, payload: any) => ({
  SimilarPosts: SimilarPosts(GraphQL, payload),
  BookChapters: BookChapters(GraphQL, payload),  // added
})
```