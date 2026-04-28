import type { Payload } from 'payload'

import { getUserId, isAdminUser } from '@/utils/access'
import { normalizeEntityId } from '@/utils/identifiers'

interface DeleteBookmarkArgs {
  id: string | number
}

interface DeleteBookmarkResult {
  ok: boolean
}

export const deleteBookmarkResolver = async (
  _: unknown,
  args: DeleteBookmarkArgs,
  context: any,
): Promise<DeleteBookmarkResult> => {
  const payload: Payload = context.req.payload
  const user = context.req.user

  if (!user) {
    throw new Error('Unauthorized')
  }

  const userId = getUserId(user)
  if (!userId) {
    throw new Error('Unauthorized')
  }

  const id = normalizeEntityId(args.id)
  if (!id) {
    throw new Error('Invalid id')
  }

  const bookmark = await payload.findByID({
    collection: 'bookmarks',
    id,
    depth: 0,
    overrideAccess: true,
  })

  if (!bookmark) {
    throw new Error('Bookmark not found')
  }

  const bookmarkUserId = normalizeEntityId((bookmark as { user?: unknown }).user)
  if (!isAdminUser(user) && String(bookmarkUserId) !== String(userId)) {
    throw new Error('Forbidden')
  }

  await payload.delete({
    collection: 'bookmarks',
    id,
    overrideAccess: true,
  })

  return { ok: true }
}
