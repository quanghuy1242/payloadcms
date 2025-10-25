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
 *   pnpm tsx scripts/backfill-lowres.ts [--dry-run] [--limit=10] [--force] [--skip-optimized] [--variants-only] [--concurrency=5]
 *
 * Options:
 *   --dry-run         Preview changes without updating database
 *   --limit=N         Process only N files (useful for testing)
 *   --skip=N          Skip first N files
 *   --force           Regenerate ALL files, even if they already have lowResUrl/optimizedUrl
 *   --skip-optimized  Skip generating optimized 1920px versions (only generate low-res)
 *   --variants-only   Only generate 6 responsive variants (skip low-res and optimized)
 *   --concurrency=N   Process N files concurrently (default: 5)
 */

type CliOptions = {
  dryRun: boolean
  force: boolean
  skipOptimized: boolean
  variantsOnly: boolean
  concurrency: number
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
  const concurrencyArg = args.find((arg) => arg.startsWith('--concurrency='))

  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : undefined
  const skip = skipArg ? parseInt(skipArg.split('=')[1], 10) : undefined
  const concurrency = concurrencyArg ? parseInt(concurrencyArg.split('=')[1], 10) : 5

  return { dryRun, force, skipOptimized, variantsOnly, concurrency, limit, skip }
}

const backfillLowRes = async (options: CliOptions) => {
  const { dryRun, skipOptimized, variantsOnly, concurrency, limit, skip = 0 } = options
  // Auto-enable force mode when using variantsOnly
  const force = options.force || variantsOnly

  console.log('🚀 Starting media variants backfill...')
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE'}`)
  if (force) console.log(`Force: Regenerating ALL files (including existing)`)
  if (skipOptimized) console.log(`Skipping optimized 1920px variants (low-res only)`)
  if (variantsOnly) console.log(`Variants only: Skipping low-res and optimized (6 variants only)`)
  console.log(`Concurrency: Processing ${concurrency} files at a time`)
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
  console.log(`Processing ${mediaFiles.length} files in batches of ${concurrency}...\n`)

  let successCount = 0
  let errorCount = 0
  const errors: Array<{ id: number; filename: string; error: string }> = []

  // Process files in batches for concurrency
  for (let i = 0; i < mediaFiles.length; i += concurrency) {
    const batch = mediaFiles.slice(i, i + concurrency)
    const batchNumber = Math.floor(i / concurrency) + 1
    const totalBatches = Math.ceil(mediaFiles.length / concurrency)

    console.log(`\n📦 Batch ${batchNumber}/${totalBatches} (${batch.length} files)...`)

    const batchResults = await Promise.allSettled(
      batch.map(async (media) =>
        processMedia(media, { dryRun, variantsOnly, skipOptimized, r2Bucket, payload }),
      ),
    )

    // Collect results
    batchResults.forEach((result, index) => {
      const media = batch[index]
      if (result.status === 'fulfilled') {
        successCount++
      } else {
        errorCount++
        errors.push({
          id: media.id,
          filename: media.filename || 'unknown',
          error: result.reason instanceof Error ? result.reason.message : String(result.reason),
        })
        console.error(
          `  ✗ ${media.filename}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`,
        )
      }
    })
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

// Process a single media file
type ProcessMediaOptions = {
  dryRun: boolean
  variantsOnly: boolean
  skipOptimized: boolean
  r2Bucket: ReturnType<typeof createR2BucketFromEnv>
  payload: Awaited<ReturnType<typeof getPayload>>
}

const processMedia = async (media: any, options: ProcessMediaOptions) => {
  const { dryRun, variantsOnly, skipOptimized, r2Bucket, payload } = options

  if (!media.url) {
    throw new Error('No URL found')
  }

  console.log(`Processing: ${media.filename}...`)
  const updates: { lowResUrl?: string; optimizedUrl?: string } = {}

  // Batch all variant fetches together for maximum parallelism
  const tasks: Promise<void>[] = []

  // Generate low-res base64 placeholder (skip if variantsOnly)
  if (!variantsOnly) {
    tasks.push(
      (async () => {
        try {
          const transformUrl = generateLowResUrl(media.url)
          const base64DataUrl = await fetchLowResImageAsBase64(transformUrl)
          const sizeKB = Math.round((base64DataUrl.length / 1024) * 100) / 100
          console.log(`  ✓ ${media.filename}: Low-res generated (${sizeKB} KB)`)
          updates.lowResUrl = base64DataUrl
        } catch (error) {
          console.error(
            `  ✗ ${media.filename}: Low-res failed: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
      })(),
    )
  }

  // Generate optimized 1920px WebP version (skip if skipOptimized or variantsOnly)
  if (!skipOptimized && !variantsOnly && r2Bucket && media.filename) {
    tasks.push(
      (async () => {
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
          console.log(`  ✓ ${media.filename}: Optimized generated (${sizeKB} KB)`)
          updates.optimizedUrl = media.url.replace(media.filename, optimizedFilename)
        } catch (error) {
          console.error(
            `  ✗ ${media.filename}: Optimized failed: ${error instanceof Error ? error.message : String(error)}`,
          )
        }
      })(),
    )
  }

  // Generate 6 responsive variants (always generate regardless of variantsOnly)
  if (r2Bucket && media.filename) {
    for (const variant of RESPONSIVE_VARIANTS) {
      tasks.push(
        (async () => {
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
            console.log(
              `  ✓ ${media.filename}: ${variant.width}x${variant.height} variant (${sizeKB} KB)`,
            )
          } catch (error) {
            console.error(
              `  ✗ ${media.filename}: ${variant.width}x${variant.height} failed: ${error instanceof Error ? error.message : String(error)}`,
            )
          }
        })(),
      )
    }
  }

  // Wait for all tasks to complete in parallel
  await Promise.allSettled(tasks)

  // Update database (skip if variantsOnly since we're not changing lowResUrl/optimizedUrl)
  if (!variantsOnly && Object.keys(updates).length > 0 && !dryRun) {
    await payload.update({
      collection: 'media',
      id: media.id,
      data: updates as any,
    })
    console.log(`  ✓ ${media.filename}: Saved to database`)
  } else if (dryRun) {
    console.log(`  ℹ ${media.filename}: DRY RUN - would save updates`)
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
