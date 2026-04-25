import { Hono } from 'hono'
import { createYoga } from 'graphql-yoga'

import { resolveSharedRequestAuth, type SharedRequestAuth } from '../../shared/auth/context'
import type { SharedDatabase } from '../../shared/db/client'

import type { WorkerBindings } from './config'
import { getDatabase } from './db/client'
import { createLoaders } from './loaders/users'
import { schema } from './graphql/schema'
import type { AppGraphQLContext } from './types'

type Variables = {
  auth: SharedRequestAuth
  db: SharedDatabase
  loaders: ReturnType<typeof createLoaders>
}

type ServerContext = WorkerBindings & {
  auth: SharedRequestAuth
  db: SharedDatabase
  loaders: ReturnType<typeof createLoaders>
}

const yoga = createYoga<ServerContext, AppGraphQLContext>({
  graphiql: true,
  schema,
  context: (serverContext) => ({
    auth: serverContext.auth,
    db: serverContext.db,
    loaders: serverContext.loaders,
    request: serverContext.request,
  }),
})

export const app = new Hono<{
  Bindings: WorkerBindings
  Variables: Variables
}>()

app.get('/health', (c) => {
  return c.json({
    ok: true,
    service: c.env.APP_NAME ?? 'payload-api',
  })
})

app.use('/graphql', async (c, next) => {
  const db = getDatabase(c.env)
  const authResolution = await resolveSharedRequestAuth({
    authBaseUrl: c.env.AUTH_BASE_URL ?? '',
    cookieNames: ['betterAuthToken', 'payloadAdminToken'],
    db,
    expectedAudience: c.env.BETTER_AUTH_EXPECTED_AUDIENCE,
    expectedIssuer: c.env.BETTER_AUTH_EXPECTED_ISSUER,
    request: c.req.raw,
  })

  if (authResolution.kind === 'rejected') {
    return authResolution.response
  }

  c.set('db', db)
  c.set('auth', authResolution.auth)
  c.set('loaders', createLoaders(db))

  await next()
})

app.all('/graphql', (c) => {
  return yoga.handle(c.req.raw, {
    auth: c.get('auth'),
    db: c.get('db'),
    loaders: c.get('loaders'),
    ...c.env,
    waitUntil: c.executionCtx.waitUntil.bind(c.executionCtx),
  })
})

export default app
