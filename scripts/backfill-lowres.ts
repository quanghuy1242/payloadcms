import { getPayload } from 'payload'
import config from '../src/payload.config'
import { fetchLowResImageAsBase64, generateLowResUrl } from '../src/utils/lowres'

/**
 * Backfill script to generate low-res base64 placeholders for existing media files.
 *
 * Usage:
 *   pnpm tsx scripts/backfill-lowres.ts [--dry-run] [--limit=10] [--force]
 *
 * Options:
 *   --dry-run    Preview changes without updating database
 *   --limit=N    Process only N files (useful for testing)
 *   --skip=N     Skip first N files
 *   --force      Regenerate ALL files, even if they already have lowResUrl
 */

type CliOptions = {
  dryRun: boolean
  force: boolean
  limit?: number
  skip?: number
}

const parseArgs = (): CliOptions => {
  const args = process.argv.slice(2)

  const dryRun = args.includes('--dry-run')
  const force = args.includes('--force')
  const limitArg = args.find((arg) => arg.startsWith('--limit='))
  const skipArg = args.find((arg) => arg.startsWith('--skip='))

  const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : undefined
  const skip = skipArg ? parseInt(skipArg.split('=')[1], 10) : undefined

  return { dryRun, force, limit, skip }
}

const backfillLowRes = async (options: CliOptions) => {
  const { dryRun, force, limit, skip = 0 } = options

  console.log('🚀 Starting low-res backfill...')
  console.log(`Mode: ${dryRun ? 'DRY RUN (no changes will be made)' : 'LIVE'}`)
  if (force) console.log(`Force: Regenerating ALL files (including existing)`)
  if (limit) console.log(`Limit: ${limit} files`)
  if (skip) console.log(`Skip: ${skip} files`)
  console.log('')

  const payload = await getPayload({ config })

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

      const transformUrl = generateLowResUrl(media.url)
      console.log(`Processing: ${media.filename}...`)

      const base64DataUrl = await fetchLowResImageAsBase64(transformUrl)
      const sizeKB = Math.round((base64DataUrl.length / 1024) * 100) / 100

      console.log(`  ✓ Generated (${sizeKB} KB)`)

      if (!dryRun) {
        await payload.update({
          collection: 'media',
          id: media.id,
          data: {
            lowResUrl: base64DataUrl,
          } as any,
        })
        console.log(`  ✓ Saved to database`)
      } else {
        console.log(`  ℹ DRY RUN - would save ${sizeKB} KB base64 string`)
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
