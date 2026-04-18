import { headers } from 'next/headers'
import { getPayload } from 'payload'

import configPromise from '@payload-config'

import { getAutherApiKey, getAutherBaseUrl } from '@/lib/env'
import { getPayloadClientId } from '@/lib/betterAuth/env'

type GrantRecord = {
  relation: string
  tupleId: string
  userEmail: string
  userId: string
}

const requireAdmin = async (): Promise<boolean> => {
  const payload = await getPayload({ config: configPromise })
  const headerStore = await headers()
  const { user } = await payload.auth({ headers: headerStore })

  return user?.role === 'admin'
}

const buildGrantsURL = (bookId: string): URL => {
  const url = new URL(`/api/internal/clients/${getPayloadClientId()}/grants`, getAutherBaseUrl())

  url.searchParams.set('entityTypeName', 'book')
  url.searchParams.set('entityId', bookId)

  return url
}

export async function GET(_request: Request, { params }: { params: { id: string } }) {
  if (!(await requireAdmin())) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const response = await fetch(buildGrantsURL(params.id), {
    headers: {
      'x-api-key': getAutherApiKey(),
    },
  })

  if (!response.ok) {
    return Response.json({ error: 'Auther error' }, { status: 502 })
  }

  const payload = (await response.json().catch(() => null)) as { grants?: GrantRecord[] } | null

  return Response.json({ grants: payload?.grants ?? [] })
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  if (!(await requireAdmin())) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

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
      entityId: params.id,
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
      entityId: params.id,
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
  if (!(await requireAdmin())) {
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