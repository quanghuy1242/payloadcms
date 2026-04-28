import type { Payload } from 'payload'

import { getUserId } from '@/utils/access'
import { generateEpubDownloadToken, getEpubExportBaseURL } from '@/utils/epubExport'
import { normalizeEntityId } from '@/utils/identifiers'

interface GenerateEpubArgs {
  bookId: string | number
}

interface GenerateEpubResult {
  downloadUrl: string
  filename: string
  expiresAt: string
}

const EXPIRY_MS = 15 * 60 * 1000

export const generateEpubResolver = async (
  _: unknown,
  args: GenerateEpubArgs,
  context: any,
): Promise<GenerateEpubResult> => {
  const payload: Payload = context.req.payload
  const user = context.req.user

  if (!user) {
    throw new Error('Unauthorized')
  }

  if (!process.env.PAYLOAD_SECRET) {
    throw new Error('PAYLOAD_SECRET is not configured')
  }

  const userId = normalizeEntityId(getUserId(user))
  if (userId == null) {
    throw new Error('Unauthorized')
  }

  const bookId = normalizeEntityId(args.bookId)
  if (bookId == null) {
    throw new Error('Invalid bookId')
  }

  const book = await payload.findByID({
    collection: 'books',
    id: bookId,
    overrideAccess: false,
  })

  if (!book) {
    throw new Error('Book not found')
  }

  const bookCreatedBy = normalizeEntityId((book as unknown as Record<string, unknown>).createdBy)
  if (String(bookCreatedBy) !== String(userId)) {
    throw new Error('Only the book owner can export EPUB')
  }

  const bookSlug = (book as unknown as Record<string, unknown>).slug as string

  const downloadToken = generateEpubDownloadToken(bookId, userId)
  const baseUrl = getEpubExportBaseURL()

  const downloadUrl = `${baseUrl}/api/epub-download/${downloadToken}`
  const expiresAt = new Date(Date.now() + EXPIRY_MS).toISOString()

  return {
    downloadUrl,
    filename: `${bookSlug}.epub`,
    expiresAt,
  }
}
