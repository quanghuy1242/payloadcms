import type { Payload } from 'payload'

import {
  createChapterPasswordProof,
  normalizeChapterPasswordVersion,
  verifyChapterPassword,
} from '@/utils/chapterPasswords'
import { normalizeEntityId } from '@/utils/identifiers'

interface UnlockChapterPasswordArgs {
  chapterId: number | string
  password: string
}

interface UnlockChapterPasswordResult {
  chapterId: string
  expiresAt: string
  proof: string
}

export const unlockChapterPasswordResolver = async (
  _: unknown,
  args: UnlockChapterPasswordArgs,
  context: any,
): Promise<UnlockChapterPasswordResult> => {
  const payload: Payload = context.req.payload

  const chapter = await payload
    .findByID({
      collection: 'chapters',
      depth: 0,
      id: args.chapterId,
      overrideAccess: true,
    })
    .catch(() => null)

  if (!chapter) {
    throw new Error('Not found')
  }

  const storedPassword = (chapter as { password?: string | null }).password ?? null
  const hasPassword = Boolean((chapter as { hasPassword?: boolean | null }).hasPassword ?? storedPassword)

  if (!hasPassword) {
    throw new Error('Chapter is not password-protected')
  }

  const passwordMatches = await verifyChapterPassword(args.password, storedPassword)

  if (!passwordMatches) {
    throw new Error('Wrong password')
  }

  const currentVersion = normalizeChapterPasswordVersion((chapter as { passwordVersion?: unknown }).passwordVersion)
  const normalizedChapterId = normalizeEntityId((chapter as { id?: unknown }).id ?? args.chapterId) ?? args.chapterId
  const proof = createChapterPasswordProof({
    chapterId: normalizedChapterId,
    passwordVersion: currentVersion,
  })

  return {
    chapterId: String(normalizedChapterId),
    expiresAt: proof.expiresAt,
    proof: proof.proof,
  }
}
