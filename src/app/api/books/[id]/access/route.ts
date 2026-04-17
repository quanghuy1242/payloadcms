import { headers } from 'next/headers'
import { getPayload } from 'payload'

import configPromise from '@payload-config'

import { getAutherApiKey, getAutherBaseUrl } from '@/lib/env'

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
  const url = new URL('/api/internal/grants', getAutherBaseUrl())

  url.searchParams.set('entityType', 'book')
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

  let body: { email?: string; relation?: string }

  try {
    body = (await request.json()) as { email?: string; relation?: string }
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
  const relation = typeof body.relation === 'string' ? body.relation.trim() : ''

  if (!email || !relation) {
    return Response.json({ error: 'email and relation are required' }, { status: 400 })
  }

  const response = await fetch(`${getAutherBaseUrl()}/api/internal/grants`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': getAutherApiKey(),
    },
    body: JSON.stringify({
      entityType: 'book',
      entityId: params.id,
      relation,
      subjectType: 'user',
      subjectEmail: email,
    }),
  })

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

  const response = await fetch(`${getAutherBaseUrl()}/api/internal/grants/${body.tupleId}`, {
    method: 'DELETE',
    headers: {
      'x-api-key': getAutherApiKey(),
    },
  })

  if (!response.ok) {
    return Response.json({ error: 'Auther error' }, { status: 502 })
  }

  return Response.json({ ok: true })
}