---
name: graphql-query-scaffold
description: Scaffold and review GraphQL query or mutation modules using the repo's directory pattern. Use when adding custom GraphQL queries or mutations, changing resolver logic, registering new types, or asked "how do I expose this via GraphQL?".
argument-hint: "[QueryName or MutationName]"
---

# GraphQL Query Scaffold

Use this skill for custom GraphQL work.
All extensions live under `src/graphql/`; the only existing query is `SimilarPosts`.

## Required directory layout

```
src/graphql/
├── index.ts                         # Re-exports { queries, mutations }
├── queries/
│   ├── index.ts                     # Aggregator: { MyQuery: MyQuery(GraphQL, payload), ... }
│   └── MyQuery/
│       ├── index.ts                 # GraphQLFieldConfig definition
│       └── resolver.ts              # Resolver function
└── mutations/
    ├── index.ts                     # (create if adding first mutation)
    └── MyMutation/
        ├── index.ts
        └── resolver.ts
```

## Resolver contract

```typescript
// resolver.ts
export const myQueryResolver = async (_: unknown, args: Args, context: any) => {
  const payload: Payload = context.req.payload  // always extract this way
  // ... logic
}

// index.ts
export const MyQuery = (GraphQL: any, payload: any): GraphQLFieldConfig<any, any> => ({
  type: payload.collections['posts'].graphQL?.type,  // reuse existing types
  args: { id: { type: new GraphQL.GraphQLNonNull(GraphQL.GraphQLString) } },
  resolve: myQueryResolver,
})
```

## Registration (aggregator)

```typescript
// src/graphql/queries/index.ts
export const queries = (GraphQL: any, payload: any) => ({
  ...existingQueries,
  MyQuery: MyQuery(GraphQL, payload),
})
```

Never register inline in `payload.config.ts`.

## Check

- Resolver logic (`resolver.ts`) is separate from schema wiring (`index.ts`).
- Each query/mutation has its own directory under `queries/` or `mutations/`.
- `payload` is extracted from `context.req.payload`, not from a module-level singleton.
- Existing collection types are reused via `payload.collections['slug'].graphQL?.type`.
- Registration happens only in the aggregator `index.ts`, not inline in `payload.config.ts`.
- Access control is enforced inside the resolver, not assumed from the schema.

## Output rule

Describe the expected folder structure and resolver contract for the feature.
If something is out of pattern, name the exact file that should move or split and why.

## Supporting files

- [template.md](template.md) for a GraphQL scaffold skeleton.
- [examples/sample.md](examples/sample.md) for the expected module format.
- [scripts/validate.sh](scripts/validate.sh) for a quick structure check.