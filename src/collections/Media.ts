import type { CollectionConfig } from 'payload'

import { authenticatedAccess, ownerAccess, publishedMediaReadAccess } from '../utils/access'
import { enforceOwnershipHook } from '../utils/ownership'
import {
  fetchLowResImageAsBase64,
  fetchOptimizedImage,
  generateLowResUrl,
  generateOptimizedUrl,
  getOptimizedFilename,
  getStorageKey,
} from '../utils/lowres'
import { createR2BucketFromEnv } from '../lib/r2Bucket'

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
        // Only generate variants on create, and only if we have a URL
        if (operation !== 'create' || !doc.url) {
          return doc
        }

        const r2Bucket = createR2BucketFromEnv()
        const payload = req.payload
        const updates: { lowResUrl?: string; optimizedUrl?: string } = {}

        // Generate low-res base64 placeholder
        try {
          const transformUrl = generateLowResUrl(doc.url)
          const base64DataUrl = await fetchLowResImageAsBase64(transformUrl)
          updates.lowResUrl = base64DataUrl
        } catch (error) {
          console.error('Failed to generate low-res image:', error)
        }

        // Generate optimized 1920px WebP version
        if (r2Bucket) {
          try {
            const optimizedTransformUrl = generateOptimizedUrl(doc.url)
            const optimizedBuffer = await fetchOptimizedImage(optimizedTransformUrl)
            const optimizedFilename = getOptimizedFilename(doc.filename)

            // Upload the optimized image to R2
            const storageKey = getStorageKey(doc)
            const optimizedKey = storageKey ? getOptimizedFilename(storageKey) : optimizedFilename

            await r2Bucket.put(optimizedKey, optimizedBuffer)

            // Generate the public URL for the optimized image
            updates.optimizedUrl = doc.url.replace(doc.filename, optimizedFilename)
          } catch (error) {
            console.error('Failed to generate optimized image:', error)
          }
        }

        // Update the document with both URLs if we have any
        if (Object.keys(updates).length > 0) {
          try {
            const updatedDoc = await payload.update({
              collection: 'media',
              id: doc.id,
              data: updates as any,
              req,
            })
            return updatedDoc
          } catch (error) {
            console.error('Failed to update media document:', error)
          }
        }

        return doc
      },
    ],
    afterDelete: [
      async ({ doc }) => {
        // Clean up the optimized file from R2
        if (!doc.optimizedUrl) {
          return
        }

        const r2Bucket = createR2BucketFromEnv()
        if (!r2Bucket) {
          return
        }

        try {
          const storageKey = getStorageKey(doc)
          const optimizedKey = storageKey
            ? getOptimizedFilename(storageKey)
            : getOptimizedFilename(doc.filename)

          await r2Bucket.delete(optimizedKey)
        } catch (error) {
          console.error('Failed to delete optimized image:', error)
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
        disableBulkEdit: true,
        disableListColumn: true, // Exclude from default list view
      },
    },
    {
      name: 'optimizedUrl',
      type: 'text',
      admin: {
        hidden: true,
        description: '1920px WebP optimized version for web delivery',
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
  upload: {
    mimeTypes: ['image/png', 'image/jpeg', 'image/jpg'],
    disableLocalStorage: true,
    crop: false, // Disable image editing/cropping in upload dialog
    focalPoint: false, // Disable focal point selection
  },
}
