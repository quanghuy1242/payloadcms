import { createHmac, timingSafeEqual } from 'crypto'

import configPromise from '@payload-config'
import { getPayload } from 'payload'

export async function POST(request: Request, { params }: { params: { id: string } }) {
  let body: { password?: string }

  try {
    body = (await request.json()) as { password?: string }
  } catch {
    return Response.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  if (!body.password) {
    return Response.json({ error: 'password is required' }, { status: 400 })
  }

  const payload = await getPayload({ config: configPromise })

  let chapter: unknown

  try {
    chapter = await payload.findByID({
      collection: 'chapters',
      depth: 0,
      id: params.id,
      overrideAccess: true,
    })
  } catch {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  if (!chapter) {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  const storedPassword = (chapter as { password?: string | null }).password ?? null

  if (!storedPassword) {
    return Response.json({ error: 'Chapter is not password-protected' }, { status: 400 })
  }

  const inputBuffer = Buffer.from(body.password, 'utf8')
  const storedBuffer = Buffer.from(storedPassword, 'utf8')

  let passwordMatches = false

  try {
    passwordMatches = timingSafeEqual(inputBuffer, storedBuffer)
  } catch {
    passwordMatches = false
  }
  if (!passwordMatches) {
    return Response.json({ error: 'Wrong password' }, { status: 401 })
  }

  const secret = process.env.PAYLOAD_SECRET

  if (!secret) {
    return Response.json({ error: 'PAYLOAD_SECRET is not set' }, { status: 500 })
  }

  const expiry = Date.now() + 60 * 60 * 1000
  const message = `${params.id}:${expiry}`
  const signature = createHmac('sha256', secret).update(message).digest('base64url')
  const token = `${message}:${signature}`

  return Response.json({ token })
}