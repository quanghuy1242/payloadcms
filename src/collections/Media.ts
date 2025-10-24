import type { CollectionConfig } from 'payload'

import { authenticatedAccess, ownerAccess, publishedMediaReadAccess } from '../utils/access'
import { enforceOwnershipHook } from '../utils/ownership'
import { fetchLowResImageAsBase64, generateLowResUrl } from '../utils/lowres'

export const Media: CollectionConfig = {
  slug: 'media',
  access: {
    create: authenticatedAccess,
    read: publishedMediaReadAccess,
    update: ownerAccess('owner'),
    delete: ownerAccess('owner'),
  },
  hooks: {
    beforeValidate: [enforceOwnershipHook('owner')],
    afterChange: [
      async ({ doc, req, operation }) => {
        // Only generate low-res on create, and only if we have a URL
        if (operation !== 'create' || !doc.url) {
          return doc
        }

        try {
          const payload = req.payload
          const transformUrl = generateLowResUrl(doc.url)
          const base64DataUrl = await fetchLowResImageAsBase64(transformUrl)

          // Update the document with the base64 data URL
          const updatedDoc = await payload.update({
            collection: 'media',
            id: doc.id,
            data: {
              lowResUrl: base64DataUrl,
            } as any,
            req,
          })

          return updatedDoc
        } catch (error) {
          console.error('Failed to generate low-res image:', error)
          // Don't fail the upload if low-res generation fails
          return doc
        }
      },
    ],
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      required: true,
    },
    {
      name: 'lowResUrl',
      type: 'textarea',
      admin: {
        hidden: true,
        description: 'Base64 encoded 20px blur placeholder for progressive image loading',
      },
    },
    {
      name: 'owner',
      type: 'relationship',
      relationTo: 'users' as const,
      required: true,
      admin: {
        position: 'sidebar',
        readOnly: true,
      },
    },
  ],
  upload: true,
}
