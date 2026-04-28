import { createHmac, timingSafeEqual } from 'crypto'

const EXPIRY_MS = 15 * 60 * 1000

type TokenPayload = {
  bookId: string
  userId: string
  expiresAt: number
}

const signToken = (data: TokenPayload): string => {
  const payloadJson = JSON.stringify(data)
  const sig = createHmac('sha256', process.env.PAYLOAD_SECRET!).update(payloadJson).digest('base64url')
  return Buffer.from(payloadJson).toString('base64url') + '.' + sig
}

const verifyToken = (token: string): TokenPayload | null => {
  if (!process.env.PAYLOAD_SECRET) {
    return null
  }

  const parts = token.split('.')
  if (parts.length !== 2) {
    return null
  }

  try {
    const payloadJson = Buffer.from(parts[0], 'base64url').toString('utf-8')
    const data = JSON.parse(payloadJson) as TokenPayload

    const expectedSig = createHmac('sha256', process.env.PAYLOAD_SECRET!)
      .update(payloadJson)
      .digest('base64url')

    const providedSig = parts[1]
    if (providedSig.length !== expectedSig.length) {
      return null
    }

    const providedBuf = Buffer.from(providedSig)
    const expectedBuf = Buffer.from(expectedSig)

    if (!timingSafeEqual(providedBuf, expectedBuf)) {
      return null
    }

    if (Date.now() > data.expiresAt) {
      return null
    }

    return data
  } catch {
    return null
  }
}

export const generateEpubDownloadToken = (bookId: string | number, userId: string | number): string => {
  return signToken({
    bookId: String(bookId),
    expiresAt: Date.now() + EXPIRY_MS,
    userId: String(userId),
  })
}

export const verifyEpubDownloadToken = (token: string): TokenPayload | null => {
  return verifyToken(token)
}

export const getEpubExportBaseURL = (requestOrigin?: string): string => {
  const normalizedRequestOrigin = requestOrigin?.trim().replace(/\/$/, '')

  if (normalizedRequestOrigin) {
    return normalizedRequestOrigin
  }

  const siteURL = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, '')

  if (siteURL) {
    return siteURL
  }

  const vercelURL = process.env.VERCEL_URL?.trim().replace(/^https?:\/\//, '').replace(/\/$/, '')

  if (vercelURL) {
    return `https://${vercelURL}`
  }

  return 'http://localhost:3000'
}

export { EXPIRY_MS }
