import { createHmac, pbkdf2, randomBytes, timingSafeEqual } from 'crypto'
import { promisify } from 'node:util'

import { normalizeEntityId } from './identifiers'

const pbkdf2Async = promisify(pbkdf2)

export const CHAPTER_PASSWORD_HASH_PREFIX = 'pbkdf2_sha256' as const
const CHAPTER_PASSWORD_HASH_ITERATIONS = 120000
export const CHAPTER_PASSWORD_PROOF_VERSION = 'v1' as const
export const CHAPTER_PASSWORD_PROOF_HEADER = 'x-chapter-password-proof' as const
export const CHAPTER_PASSWORD_PROOF_COOKIE = 'chapter-password-proof' as const
const CHAPTER_PASSWORD_PROOF_TTL_MS = 60 * 60 * 1000

type ChapterAccessUser = {
  id?: string | number | null
  role?: string | null
}

type ChapterPasswordDocument = {
  createdBy?: unknown
  hasPassword?: boolean | null
  id?: unknown
  password?: unknown
  passwordVersion?: unknown
}

type ChapterPasswordLookupRequest = {
  headers?: Headers | null
  payload?: {
    db?: {
      findOne?: (args: {
        collection: string
        req: ChapterPasswordLookupRequest
        select?: Record<string, boolean>
        where: {
          id: {
            equals: unknown
          }
        }
      }) => Promise<ChapterPasswordDocument | null>
    } | null
  } | null
  user?: ChapterAccessUser | null
}

type ChapterPasswordProofPayload = {
  chapterId: string
  expiresAt: number
  passwordVersion: number
}

const normalizePasswordVersion = (value: unknown): number => {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value))
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number.parseInt(value, 10)

    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.floor(parsed))
    }
  }

  return 0
}

const getCookieValue = (cookieHeader: string, cookieName: string): string | null => {
  const segments = cookieHeader.split(';')

  for (const segment of segments) {
    const [rawName, ...rawValueParts] = segment.split('=')

    if (!rawName || rawValueParts.length === 0) {
      continue
    }

    if (rawName.trim() !== cookieName) {
      continue
    }

    const value = rawValueParts.join('=').trim()

    return value.length > 0 ? decodeURIComponent(value) : null
  }

  return null
}

const parseStoredHash = (storedPassword: string) => {
  const [prefix, iterationsText, salt, hash] = storedPassword.split('$')

  if (
    prefix !== CHAPTER_PASSWORD_HASH_PREFIX ||
    !iterationsText ||
    !salt ||
    !hash ||
    !Number.isFinite(Number.parseInt(iterationsText, 10))
  ) {
    return null
  }

  return {
    hash,
    iterations: Number.parseInt(iterationsText, 10),
    salt,
  }
}

export const hashChapterPassword = async (password: string): Promise<string> => {
  const salt = randomBytes(16).toString('base64url')
  const derivedKey = await pbkdf2Async(password, salt, CHAPTER_PASSWORD_HASH_ITERATIONS, 32, 'sha256')

  return [
    CHAPTER_PASSWORD_HASH_PREFIX,
    CHAPTER_PASSWORD_HASH_ITERATIONS,
    salt,
    derivedKey.toString('base64url'),
  ].join('$')
}

export const verifyChapterPassword = async (
  password: string,
  storedPassword: string | null | undefined,
): Promise<boolean> => {
  if (typeof storedPassword !== 'string' || storedPassword.length === 0) {
    return false
  }

  const parsedHash = parseStoredHash(storedPassword)

  if (!parsedHash) {
    const inputBuffer = Buffer.from(password, 'utf8')
    const storedBuffer = Buffer.from(storedPassword, 'utf8')

    if (inputBuffer.length !== storedBuffer.length) {
      return false
    }

    return timingSafeEqual(inputBuffer, storedBuffer)
  }

  const derivedKey = await pbkdf2Async(password, parsedHash.salt, parsedHash.iterations, 32, 'sha256')
  const storedBuffer = Buffer.from(parsedHash.hash, 'base64url')

  if (derivedKey.length !== storedBuffer.length) {
    return false
  }

  return timingSafeEqual(derivedKey, storedBuffer)
}

export const createChapterPasswordProof = ({
  chapterId,
  expiresInMs = CHAPTER_PASSWORD_PROOF_TTL_MS,
  passwordVersion,
  secret = process.env.PAYLOAD_SECRET,
  now = Date.now(),
}: {
  chapterId: string | number
  expiresInMs?: number
  passwordVersion: unknown
  secret?: string | null
  now?: number
}): { expiresAt: string; proof: string } => {
  if (!secret) {
    throw new Error('PAYLOAD_SECRET is not set')
  }

  const expiresAt = now + Math.max(1, Math.floor(expiresInMs))
  const payload: ChapterPasswordProofPayload = {
    chapterId: String(chapterId),
    expiresAt,
    passwordVersion: normalizePasswordVersion(passwordVersion),
  }
  const payloadPart = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  const signature = createHmac('sha256', secret).update(payloadPart).digest('base64url')

  return {
    expiresAt: new Date(expiresAt).toISOString(),
    proof: `${CHAPTER_PASSWORD_PROOF_VERSION}.${payloadPart}.${signature}`,
  }
}

export const verifyChapterPasswordProof = ({
  chapterId,
  passwordVersion,
  proof,
  secret = process.env.PAYLOAD_SECRET,
  now = Date.now(),
}: {
  chapterId: string | number | null | undefined
  passwordVersion: unknown
  proof: string | null | undefined
  secret?: string | null
  now?: number
}): boolean => {
  if (!proof || !secret) {
    return false
  }

  const [version, payloadPart, signature] = proof.split('.')

  if (version !== CHAPTER_PASSWORD_PROOF_VERSION || !payloadPart || !signature) {
    return false
  }

  let expectedSignature: Buffer
  let signatureBuffer: Buffer

  try {
    expectedSignature = Buffer.from(createHmac('sha256', secret).update(payloadPart).digest('base64url'), 'base64url')
    signatureBuffer = Buffer.from(signature, 'base64url')
  } catch {
    return false
  }

  if (expectedSignature.length !== signatureBuffer.length) {
    return false
  }

  if (!timingSafeEqual(expectedSignature, signatureBuffer)) {
    return false
  }

  let decodedPayload: ChapterPasswordProofPayload

  try {
    decodedPayload = JSON.parse(Buffer.from(payloadPart, 'base64url').toString('utf8')) as ChapterPasswordProofPayload
  } catch {
    return false
  }

  if (decodedPayload.chapterId !== String(chapterId)) {
    return false
  }

  if (decodedPayload.passwordVersion !== normalizePasswordVersion(passwordVersion)) {
    return false
  }

  if (!Number.isFinite(decodedPayload.expiresAt) || decodedPayload.expiresAt <= now) {
    return false
  }

  return true
}

export const getChapterPasswordProofFromHeaders = (headers?: Headers | null): string | null => {
  if (!headers || typeof headers.get !== 'function') {
    return null
  }

  const headerValue = headers.get(CHAPTER_PASSWORD_PROOF_HEADER)?.trim() || headers.get('chapter-password-proof')?.trim()

  if (headerValue) {
    return headerValue
  }

  const cookieValue = getCookieValue(headers.get('cookie') ?? '', CHAPTER_PASSWORD_PROOF_COOKIE)

  return cookieValue?.trim() || null
}

export const canReadChapterContent = ({
  chapter,
  chapterId,
  headers,
  user,
}: {
  chapter: ChapterPasswordDocument | null | undefined
  chapterId?: unknown
  headers?: Headers | null
  user?: ChapterAccessUser | null
}): boolean => {
  if (!chapter) {
    return false
  }

  const isProtected = Boolean(chapter.hasPassword ?? chapter.password)

  if (!isProtected) {
    return true
  }

  if (user?.role === 'admin') {
    return true
  }

  const chapterOwnerId = normalizeEntityId(chapter.createdBy)
  const userId = normalizeEntityId(user?.id)

  if (chapterOwnerId != null && userId != null && String(chapterOwnerId) === String(userId)) {
    return true
  }

  const proof = getChapterPasswordProofFromHeaders(headers)

  if (!proof) {
    return false
  }

  return verifyChapterPasswordProof({
    chapterId: normalizeEntityId(chapterId ?? chapter.id),
    passwordVersion: chapter.passwordVersion,
    proof,
  })
}

const fetchChapterPasswordMetadata = async ({
  chapterId,
  req,
}: {
  chapterId: unknown
  req?: ChapterPasswordLookupRequest | null
}): Promise<ChapterPasswordDocument | null> => {
  const normalizedChapterId = normalizeEntityId(chapterId)

  if (normalizedChapterId == null) {
    return null
  }

  const findOne = req?.payload?.db?.findOne

  if (!findOne) {
    return null
  }

  return findOne({
    collection: 'chapters',
    req: req ?? {},
    select: {
      createdBy: true,
      hasPassword: true,
      id: true,
      passwordVersion: true,
    },
    where: {
      id: {
        equals: normalizedChapterId,
      },
    },
  }).catch(() => null)
}

export const canReadChapterContentForRequest = async ({
  chapter,
  chapterId,
  headers,
  req,
  user,
}: {
  chapter: ChapterPasswordDocument | null | undefined
  chapterId?: unknown
  headers?: Headers | null
  req?: ChapterPasswordLookupRequest | null
  user?: ChapterAccessUser | null
}): Promise<boolean> => {
  if (!chapter) {
    return false
  }

  const isProtected = Boolean(chapter.hasPassword ?? chapter.password)

  if (!isProtected) {
    return true
  }

  if (user?.role === 'admin') {
    return true
  }

  const chapterOwnerId = normalizeEntityId(chapter.createdBy)
  const userId = normalizeEntityId(user?.id)

  if (chapterOwnerId != null && userId != null && String(chapterOwnerId) === String(userId)) {
    return true
  }

  const proof = getChapterPasswordProofFromHeaders(headers)

  if (!proof) {
    return false
  }

  const resolvedChapter =
    chapter.passwordVersion == null || chapterOwnerId == null
      ? await fetchChapterPasswordMetadata({
          chapterId: chapterId ?? chapter.id,
          req,
        })
      : chapter

  return verifyChapterPasswordProof({
    chapterId: normalizeEntityId(chapterId ?? resolvedChapter?.id ?? chapter.id),
    passwordVersion: resolvedChapter?.passwordVersion ?? chapter.passwordVersion,
    proof,
  })
}

export const nextChapterPasswordVersion = (value: unknown): number => {
  return normalizePasswordVersion(value) + 1
}

export const normalizeChapterPasswordVersion = normalizePasswordVersion
