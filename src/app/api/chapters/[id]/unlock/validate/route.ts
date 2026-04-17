import { createHmac, timingSafeEqual } from 'crypto'

export async function POST(request: Request, { params }: { params: { id: string } }) {
  let body: { token?: string }

  try {
    body = (await request.json()) as { token?: string }
  } catch {
    return Response.json({ valid: false }, { status: 400 })
  }

  if (!body.token) {
    return Response.json({ valid: false })
  }

  const parts = body.token.split(':')

  if (parts.length !== 3) {
    return Response.json({ valid: false })
  }

  const [chapterId, expiryString, signature] = parts
  const expiry = Number.parseInt(expiryString, 10)

  if (chapterId !== params.id || Number.isNaN(expiry) || Date.now() > expiry) {
    return Response.json({ valid: false })
  }

  const secret = process.env.PAYLOAD_SECRET

  if (!secret) {
    return Response.json({ valid: false }, { status: 500 })
  }

  const message = `${chapterId}:${expiryString}`
  const expectedSignature = createHmac('sha256', secret).update(message).digest('base64url')

  const signatureBuffer = Buffer.from(signature, 'base64url')
  const expectedBuffer = Buffer.from(expectedSignature, 'base64url')

  const isValid =
    signatureBuffer.length === expectedBuffer.length && timingSafeEqual(signatureBuffer, expectedBuffer)

  return Response.json({ valid: isValid })
}