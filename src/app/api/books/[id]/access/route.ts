import { getPayload } from 'payload'

import configPromise from '@payload-config'

import { getAutherApiKey, getAutherBaseUrl } from '@/lib/env'
import { getPayloadClientId } from '@/lib/betterAuth/env'

type GrantRecord = {
  relation: string
  tupleId: string
  userEmail: string
  userId: string
  scope: 'direct' | 'wildcard'
}

type PopulatedUser = {
  email?: string | null
  id?: string | number | null
}

type GrantMirrorWildcardDoc = {
  autherTupleId?: string
  entityId?: string
  payloadUserId?: string | number | PopulatedUser | null
  relation?: string
}

const getAdminPayload = async (requestHeaders: Headers) => {
  const payload = await getPayload({ config: configPromise })
  const { user } = await payload.auth({ headers: requestHeaders })

  return user?.role === 'admin' ? payload : null
}

const buildGrantsURL = (bookId: string): URL => {
  const url = new URL(`/api/internal/clients/${getPayloadClientId()}/grants`, getAutherBaseUrl())

  url.searchParams.set('entityTypeName', 'book')
  url.searchParams.set('entityId', bookId)

  return url
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const payload = await getAdminPayload(request.headers)

  if (!payload) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params

  const [response, wildcardGrantResult] = await Promise.all([
    fetch(buildGrantsURL(id), {
      headers: {
        'x-api-key': getAutherApiKey(),
      },
    }),
    payload.find({
      collection: 'grant-mirror',
      where: {
        and: [
          { entityType: { equals: 'book' } },
          { entityId: { equals: '*' } },
          { syncStatus: { equals: 'active' } },
        ],
      },
      depth: 1,
      limit: 100,
      page: 1,
      overrideAccess: true,
    }),
  ])

  if (!response.ok) {
    return Response.json({ error: 'Auther error' }, { status: 502 })
  }

  const directPayload = (await response.json().catch(() => null)) as { grants?: GrantRecord[] } | null

  const directGrants = (directPayload?.grants ?? []).map<GrantRecord>((grant) => ({
    relation: grant.relation,
    scope: 'direct',
    tupleId: grant.tupleId,
    userEmail: grant.userEmail,
    userId: grant.userId,
  }))

  const wildcardGrants = (wildcardGrantResult.docs as GrantMirrorWildcardDoc[])
    .filter((doc) => doc.autherTupleId && doc.relation)
    .map<GrantRecord>((doc) => {
      const payloadUser =
        doc.payloadUserId != null && typeof doc.payloadUserId === 'object'
          ? (doc.payloadUserId as PopulatedUser)
          : null
      const userId =
        payloadUser?.id != null
          ? String(payloadUser.id)
          : doc.payloadUserId != null
            ? String(doc.payloadUserId)
            : ''

      return {
        relation: doc.relation ?? 'viewer',
        scope: 'wildcard',
        tupleId: doc.autherTupleId ?? '',
        userEmail: payloadUser?.email ? String(payloadUser.email) : userId || 'Unknown user',
        userId: userId || 'unknown',
      }
    })

  return Response.json({ grants: [...directGrants, ...wildcardGrants] })
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await getAdminPayload(request.headers))) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params

  let body: { email?: string; relation?: string; groupId?: string; subjectType?: string }

  try {
    body = (await request.json()) as {
      email?: string
      relation?: string
      groupId?: string
      subjectType?: string
    }
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const relation = typeof body.relation === 'string' ? body.relation.trim() : ''
  const subjectType = body.subjectType === 'group' ? 'group' : 'user'

  if (!relation) {
    return Response.json({ error: 'relation is required' }, { status: 400 })
  }

  let grantBody: Record<string, string>

  if (subjectType === 'group') {
    const groupId = typeof body.groupId === 'string' ? body.groupId.trim() : ''

    if (!groupId) {
      return Response.json({ error: 'groupId is required for group grants' }, { status: 400 })
    }

    grantBody = {
      entityTypeName: 'book',
      entityId: id,
      relation,
      subjectType: 'group',
      subjectId: groupId,
    }
  } else {
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''

    if (!email) {
      return Response.json({ error: 'email is required for user grants' }, { status: 400 })
    }

    grantBody = {
      entityTypeName: 'book',
      entityId: id,
      relation,
      subjectType: 'user',
      subjectEmail: email,
    }
  }

  const response = await fetch(
    `${getAutherBaseUrl()}/api/internal/clients/${getPayloadClientId()}/grants`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': getAutherApiKey(),
      },
      body: JSON.stringify(grantBody),
    },
  )

  if (!response.ok) {
    const errorBody = (await response.json().catch(() => null)) as { error?: string } | null

    return Response.json({ error: errorBody?.error ?? 'Auther error' }, { status: 502 })
  }

  const payload = (await response.json().catch(() => null)) as { ok?: boolean } | null

  return Response.json({ ok: payload?.ok ?? true })
}

export async function DELETE(request: Request) {
  if (!(await getAdminPayload(request.headers))) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: { tupleId?: string }

  try {
    body = (await request.json()) as { tupleId?: string }
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.tupleId) {
    return Response.json({ error: 'tupleId is required' }, { status: 400 })
  }

  const response = await fetch(
    `${getAutherBaseUrl()}/api/internal/clients/${getPayloadClientId()}/grants/${body.tupleId}`,
    {
      method: 'DELETE',
      headers: {
        'x-api-key': getAutherApiKey(),
      },
    },
  )

  if (!response.ok) {
    return Response.json({ error: 'Auther error' }, { status: 502 })
  }

  return Response.json({ ok: true })
}