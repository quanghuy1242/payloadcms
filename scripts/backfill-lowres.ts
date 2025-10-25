import { getPayload } from 'payload'
import config from '../src/payload.config'
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
} from '../src/utils/lowres'
import { createR2BucketFromEnv } from '../src/lib/r2Bucket'

/**
 * Backfill script to generate low-res base64 placeholders and optimized WebP versions for existing media files.
 *
 * Usage:
 *   pnpm tsx scripts/backfill-lowres.ts [--dry-run] [--limit=10] [--force] [--skip-optimized] [--variants-only]
 *
 * Options:
 *   --dry-run         Preview changes without updating database
 *   --limit=N         Process only N files (useful for testing)
 *   --skip=N          Skip first N files
 *   --force           Regenerate ALL files, even if they already have lowResUrl/optimizedUrl
 *   --skip-optimized  Skip generating optimized 1920px versions (only generate low-res)
 *   --variants-only   Only generate 6 responsive variants (skip low-res and optimized)
 */

type CliOptions = {
  dryRun: boolean
  force: boolean
  skipOptimized: boolean
  variantsOnly: boolean
  limit?: number
  skip?: number
}

const parseArgs = (): CliOptions => {
  const args = process.argv.slice(2)

  const dryRun = args.includes('--dry-run')
  const force = args.includes('--force')
  const skipOptimized = args.includes('--skip-optimized')
  const variantsOnly = args.includes('--variants-only')
  const limitArg = args.find((arg) => arg.startsWith('--limit='))
  const skipArg = args.find((arg) => arg.startsWith('--skip='))

  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : undefined
  const skip = skipArg ? parseInt(skipArg.split('=')[1], 10) : undefined

  return { dryRun, force, skipOptimized, variantsOnly, limit, skip }
}

const backfillLowRes = async (options: CliOptions) => {
  const { dryRun, skipOptimized, variantsOnly, limit, skip = 0 } = options
  // Auto-enable force mode when using variantsOnly
  const force = options.force || variantsOnly

  console.log('🚀 Starting media variants backfill...')
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE'}`)
  if (force) console.log(`Force: Regenerating ALL files (including existing)`)
  if (skipOptimized) console.log(`Skipping optimized 1920px variants (low-res only)`)
  if (variantsOnly) console.log(`Variants only: Skipping low-res and optimized (6 variants only)`)
  if (limit) console.log(`Limit: ${limit} files`)
  if (skip) console.log(`Skip: ${skip} files`)
  console.log('')

  const payload = await getPayload({ config })
  const r2Bucket = skipOptimized && !variantsOnly ? null : createR2BucketFromEnv()

  if (!variantsOnly && !skipOptimized && !r2Bucket) {
    console.warn('⚠️  R2 bucket not configured, skipping optimized variants')
  }

  // Fetch media files based on force flag
  const { docs: mediaFiles, totalDocs } = await payload.find({
    collection: 'media',
    where: force
      ? {} // Force mode: fetch all media files
      : {
          lowResUrl: {
            exists: false, // Normal mode: only files without lowResUrl
          },
        },
    limit: limit || 1000,
    page: Math.floor(skip / (limit || 1000)) + 1,
  })

  console.log(`Found ${totalDocs} media files ${force ? 'total' : 'without lowResUrl'}`)
  console.log(`Processing ${mediaFiles.length} files...\n`)

  let successCount = 0
  let errorCount = 0
  const errors: Array<{ id: number; filename: string; error: string }> = []

  for (const media of mediaFiles) {
    try {
      if (!media.url) {
        console.warn(`⚠️  Skipping ${media.filename} - no URL found`)
        continue
      }

      console.log(`Processing: ${media.filename}...`)
      const updates: { lowResUrl?: string; optimizedUrl?: string } = {}

      // Generate low-res base64 placeholder (skip if variantsOnly)
      if (!variantsOnly) {
        try {
          const transformUrl = generateLowResUrl(media.url)
          const base64DataUrl = await fetchLowResImageAsBase64(transformUrl)
          const sizeKB = Math.round((base64DataUrl.length / 1024) * 100) / 100
          console.log(`  ✓ Low-res generated (${sizeKB} KB)`)
          updates.lowResUrl = base64DataUrl
        } catch (error) {
          console.error(
            `  ✗ Low-res failed: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
      }

      // Generate optimized 1920px WebP version (skip if skipOptimized or variantsOnly)
      if (!skipOptimized && !variantsOnly && r2Bucket && media.filename) {
        try {
          const optimizedTransformUrl = generateOptimizedUrl(media.url)
          const optimizedBuffer = await fetchOptimizedImage(optimizedTransformUrl)
          const optimizedFilename = getOptimizedFilename(media.filename)
          const storageKey = getStorageKey(media as any)
          const optimizedKey = storageKey ? getOptimizedFilename(storageKey) : optimizedFilename

          if (!dryRun) {
            await r2Bucket.put(optimizedKey, optimizedBuffer)
          }

          const sizeKB = Math.round((optimizedBuffer.length / 1024) * 100) / 100
          console.log(`  ✓ Optimized generated (${sizeKB} KB)`)
          updates.optimizedUrl = media.url.replace(media.filename, optimizedFilename)
        } catch (error) {
          console.error(
            `  ✗ Optimized failed: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
      }

      // Generate 6 responsive variants (always generate regardless of variantsOnly)
      if (r2Bucket && media.filename) {
        for (const variant of RESPONSIVE_VARIANTS) {
          try {
            const variantTransformUrl = generateResponsiveVariantUrl(media.url, variant)
            const variantBuffer = await fetchResponsiveVariant(variantTransformUrl)
            const variantFilename = getResponsiveVariantFilename(media.filename, variant)
            const storageKey = getStorageKey(media as any)
            const variantKey = storageKey
              ? getResponsiveVariantFilename(storageKey, variant)
              : variantFilename

            if (!dryRun) {
              await r2Bucket.put(variantKey, variantBuffer)
            }

            const sizeKB = Math.round((variantBuffer.length / 1024) * 100) / 100
            console.log(`  ✓ ${variant.width}x${variant.height} variant (${sizeKB} KB)`)
          } catch (error) {
            console.error(
              `  ✗ ${variant.width}x${variant.height} failed: ${error instanceof Error ? error.message : String(error)}`,
            )
          }
        }
      }

      // Update database (skip if variantsOnly since we're not changing lowResUrl/optimizedUrl)
      if (!variantsOnly && Object.keys(updates).length > 0 && !dryRun) {
        await payload.update({
          collection: 'media',
          id: media.id,
          data: updates as any,
        })
        console.log(`  ✓ Saved to database`)
      } else if (dryRun) {
        console.log(`  ℹ DRY RUN - would save updates`)
      }

      successCount++
    } catch (error) {
      errorCount++
      const errorMsg = error instanceof Error ? error.message : String(error)
      console.error(`  ✗ Failed: ${errorMsg}`)
      errors.push({
        id: media.id,
        filename: media.filename || 'unknown',
        error: errorMsg,
      })
    }
  }

  console.log('\n' + '='.repeat(60))
  console.log('📊 Summary:')
  console.log(`  ✓ Success: ${successCount}`)
  console.log(`  ✗ Errors: ${errorCount}`)
  console.log('='.repeat(60))

  if (errors.length > 0) {
    console.log('\n⚠️  Failed files:')
    errors.forEach(({ id, filename, error }) => {
      console.log(`  - ${filename} (ID: ${id}): ${error}`)
    })
  }

  if (dryRun) {
    console.log('\n💡 This was a dry run. Run without --dry-run to save changes.')
  }
}

const main = async () => {
  try {
    const options = parseArgs()
    await backfillLowRes(options)
    process.exit(0)
  } catch (error) {
    console.error('Fatal error:', error)
    process.exit(1)
  }
}

void main()
