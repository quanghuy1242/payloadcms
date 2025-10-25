import type { CollectionConfig } from 'payload'

import { authenticatedAccess, ownerAccess, publishedMediaReadAccess } from '../utils/access'
import { enforceOwnershipHook } from '../utils/ownership'
import {
  fetchLowResImageAsBase64,
  fetchOptimizedImage,
  fetchResponsiveVariant,
  generateLowResUrl,
  generateOptimizedUrl,
  generateResponsiveVariantUrl,
  getOptimizedFilename,
  getResponsiveVariantFilename,
  getStorageKey,
  RESPONSIVE_VARIANTS,
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

        // Fetch all variants in parallel for maximum speed
        const tasks: Promise<void>[] = []

        // Generate low-res base64 placeholder
        tasks.push(
          (async () => {
            try {
              const transformUrl = generateLowResUrl(doc.url)
              const base64DataUrl = await fetchLowResImageAsBase64(transformUrl)
              updates.lowResUrl = base64DataUrl
            } catch (error) {
              console.error('Failed to generate low-res image:', error)
            }
          })(),
        )

        // Generate optimized 1920px WebP version
        if (r2Bucket) {
          tasks.push(
            (async () => {
              try {
                const optimizedTransformUrl = generateOptimizedUrl(doc.url)
                const optimizedBuffer = await fetchOptimizedImage(optimizedTransformUrl)
                const optimizedFilename = getOptimizedFilename(doc.filename)

                // Upload the optimized image to R2
                const storageKey = getStorageKey(doc)
                const optimizedKey = storageKey
                  ? getOptimizedFilename(storageKey)
                  : optimizedFilename

                await r2Bucket.put(optimizedKey, optimizedBuffer)

                // Generate the public URL for the optimized image
                updates.optimizedUrl = doc.url.replace(doc.filename, optimizedFilename)
              } catch (error) {
                console.error('Failed to generate optimized image:', error)
              }
            })(),
          )

          // Generate 6 responsive variants in parallel
          for (const variant of RESPONSIVE_VARIANTS) {
            tasks.push(
              (async () => {
                try {
                  const variantTransformUrl = generateResponsiveVariantUrl(doc.url, variant)
                  const variantBuffer = await fetchResponsiveVariant(variantTransformUrl)
                  const variantFilename = getResponsiveVariantFilename(doc.filename, variant)

                  // Upload the variant to R2
                  const storageKey = getStorageKey(doc)
                  const variantKey = storageKey
                    ? getResponsiveVariantFilename(storageKey, variant)
                    : variantFilename

                  await r2Bucket.put(variantKey, variantBuffer)

                  console.log(
                    `Generated responsive variant: ${variant.width}x${variant.height} (${Math.round(variantBuffer.length / 1024)} KB)`,
                  )
                } catch (error) {
                  console.error(
                    `Failed to generate ${variant.width}x${variant.height} variant:`,
                    error,
                  )
                }
              })(),
            )
          }
        }

        // Wait for all tasks to complete in parallel (8 total: low-res + optimized + 6 variants)
        await Promise.allSettled(tasks)

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
        const r2Bucket = createR2BucketFromEnv()
        if (!r2Bucket) {
          return
        }

        const storageKey = getStorageKey(doc)
        const keysToDelete: string[] = []

        // Clean up the optimized file
        if (doc.optimizedUrl) {
          const optimizedKey = storageKey
            ? getOptimizedFilename(storageKey)
            : getOptimizedFilename(doc.filename)
          keysToDelete.push(optimizedKey)
        }

        // Clean up all 6 responsive variants
        for (const variant of RESPONSIVE_VARIANTS) {
          const variantKey = storageKey
            ? getResponsiveVariantFilename(storageKey, variant)
            : getResponsiveVariantFilename(doc.filename, variant)
          keysToDelete.push(variantKey)
        }

        // Delete all variants in one call
        if (keysToDelete.length > 0) {
          try {
            await r2Bucket.delete(keysToDelete)
            console.log(`Deleted ${keysToDelete.length} image variants for ${doc.filename}`)
          } catch (error) {
            console.error('Failed to delete image variants:', error)
          }
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
    focalPoint: true, // Keep focal point data (but user won't see the UI since crop is disabled)
  },
}
