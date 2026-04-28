import { createHmac } from 'node:crypto'

import type { Payload } from 'payload'

import { getUserId, isAdminUser } from '@/utils/access'
import { normalizeEntityId } from '@/utils/identifiers'

interface PreviewTokenArgs {
  docType: string
  docId: string | number
}

interface PreviewTokenResult {
  token: string
  slug: string
}

const VALID_DOC_TYPES = ['books', 'posts'] as const
type DocType = (typeof VALID_DOC_TYPES)[number]

const PREVIEW_TOKEN_TTL_MS = 15 * 60 * 1000

const getSecret = (): string => {
  const secret = process.env.PAYLOAD_SECRET
  if (!secret) {
    throw new Error('PAYLOAD_SECRET is not set')
  }
  return secret
}

const generatePreviewToken = (data: Record<string, unknown>, secret: string): string => {
  const payload = JSON.stringify(data)
  const sig = createHmac('sha256', secret).update(payload).digest('base64url')
  return Buffer.from(payload).toString('base64url') + '.' + sig
}

const ownerFieldForDocType = (docType: DocType): string => {
  return docType === 'books' ? 'createdBy' : 'author'
}

export const previewTokenResolver = async (
  _: unknown,
  args: PreviewTokenArgs,
  context: any,
): Promise<PreviewTokenResult> => {
  const payload: Payload = context.req.payload
  const user = context.req.user

  if (!user) {
    throw new Error('Unauthorized')
  }

  const { docType, docId } = args

  if (!VALID_DOC_TYPES.includes(docType as DocType)) {
    throw new Error(`Invalid docType: ${docType}. Must be one of: ${VALID_DOC_TYPES.join(', ')}`)
  }

  const doc = await payload.findByID({
    collection: docType as DocType,
    id: docId,
    overrideAccess: true,
  })

  if (!doc) {
    throw new Error('Document not found')
  }

  const isAdmin = isAdminUser(user)

  if (!isAdmin) {
    const userId = normalizeEntityId(getUserId(user))
    const ownerField = ownerFieldForDocType(docType as DocType)
    const ownerId = (doc as unknown as Record<string, unknown>)[ownerField]
    const docOwnerId = normalizeEntityId(ownerId)

    if (typeof docOwnerId !== 'number' || typeof userId !== 'number') {
      throw new Error('You are not authorized to preview this document')
    }

    if (userId !== docOwnerId) {
      throw new Error('You are not authorized to preview this document')
    }
  }

  const slug = (doc as unknown as Record<string, unknown>).slug
  if (typeof slug !== 'string' || slug.length === 0) {
    throw new Error('Document has no slug')
  }

  const secret = getSecret()
  const expiresAt = Date.now() + PREVIEW_TOKEN_TTL_MS

  const token = generatePreviewToken(
    {
      docType,
      docId: String(docId),
      slug,
      expiresAt,
    },
    secret,
  )

  return { token, slug }
}
