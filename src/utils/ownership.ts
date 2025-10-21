import type { CollectionBeforeValidateHook, CollectionSlug } from 'payload'

import { getUserId, isAdminUser, normalizeEntityId } from './access'

export const enforceOwnershipHook = (fieldName: string): CollectionBeforeValidateHook => {
  return ({ data, originalDoc, operation, req }) => {
    if (isAdminUser(req.user)) {
      return data
    }

    const userId = getUserId(req.user)

    if (userId == null) {
      return data
    }

    const workingData = data ? { ...data } : {}

    if (operation === 'create') {
      workingData[fieldName] = userId
      return workingData
    }

    const originalOwner = normalizeEntityId(originalDoc?.[fieldName])

    if (originalOwner != null) {
      workingData[fieldName] = originalOwner
    } else {
      workingData[fieldName] = userId
    }

    return workingData
  }
}

type RelationshipOwnershipOptions = {
  /**
   * Related collection slug.
   */
  collection: CollectionSlug
  /**
   * Field on the parent data that stores the relationship.
   */
  field: string
  /**
   * Field on the related document that stores the owning user.
   */
  ownerField: string
  /**
   * Optional custom error message.
   */
  unauthorizedMessage?: string
}

export const validateRelationshipOwnership = ({
  collection,
  field,
  ownerField,
  unauthorizedMessage = 'You do not have permission to use the selected resource.',
}: RelationshipOwnershipOptions): CollectionBeforeValidateHook => {
  return async ({ data, originalDoc, req }) => {
    if (isAdminUser(req.user)) {
      return data
    }

    const userId = getUserId(req.user)

    if (userId == null) {
      return data
    }

    const candidate = data?.[field] ?? originalDoc?.[field]
    const relatedId = normalizeEntityId(candidate)

    if (relatedId == null) {
      return data
    }

    const relatedDoc = (await req.payload
      .findByID({
        collection,
        id: relatedId,
        depth: 0,
        req,
      })
      .catch(() => null)) as Record<string, unknown> | null

    if (!relatedDoc) {
      throw new Error('Related resource not found.')
    }

    const ownerId = normalizeEntityId(relatedDoc[ownerField])

    if (ownerId != null && String(ownerId) !== String(userId)) {
      throw new Error(unauthorizedMessage)
    }

    return data
  }
}
