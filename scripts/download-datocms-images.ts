import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { pipeline } from 'node:stream/promises'

import { toNullableString } from '../src/utils/strings'

/**
 * DatoCMS Upload record structure
 * Adjust based on your actual DatoCMS schema
 */
type DatoCMSUpload = {
  id: string
  url: string
  filename: string
  alt?: string | null
  title?: string | null
  format?: string
  size?: number
  width?: number | null
  height?: number | null
  mimeType?: string
  focalPoint?: {
    x: number
    y: number
  } | null
  customData?: Record<string, unknown>
}

type CliOptions = {
  apiToken: string
  outputDir: string
  environment?: string
}

/**
 * Parse command-line arguments
 */
const parseArgs = (): CliOptions => {
  const tokenFlagIndex = process.argv.findIndex((arg) => arg === '--token' || arg === '-t')
  const outputFlagIndex = process.argv.findIndex((arg) => arg === '--output' || arg === '-o')
  const envFlagIndex = process.argv.findIndex((arg) => arg === '--env' || arg === '-e')

  if (tokenFlagIndex === -1 || tokenFlagIndex + 1 >= process.argv.length) {
    throw new Error(
      'Usage: pnpm download:datocms --token YOUR_TOKEN --output ./downloads [--env production]',
    )
  }

  const apiToken = toNullableString(process.argv[tokenFlagIndex + 1])
  if (!apiToken) {
    throw new Error('API token must be a non-empty string.')
  }

  let outputDir = './media/datocms-downloads'
  if (outputFlagIndex !== -1 && outputFlagIndex + 1 < process.argv.length) {
    const outputValue = toNullableString(process.argv[outputFlagIndex + 1])
    if (outputValue) {
      outputDir = outputValue
    }
  }

  let environment: string | undefined
  if (envFlagIndex !== -1 && envFlagIndex + 1 < process.argv.length) {
    environment = toNullableString(process.argv[envFlagIndex + 1]) ?? undefined
  }

  return {
    apiToken,
    outputDir,
    environment,
  }
}

/**
 * Fetch all uploads from DatoCMS using their GraphQL API
 */
const fetchAllUploads = async (
  apiToken: string,
  environment?: string,
): Promise<DatoCMSUpload[]> => {
  const endpoint = 'https://graphql.datocms.com/'
  const allUploads: DatoCMSUpload[] = []
  let hasMore = true
  let skip = 0
  const first = 100 // DatoCMS typically allows up to 100 items per page

  console.log('Fetching uploads from DatoCMS...')

  while (hasMore) {
    const query = `
      query AllUploads($first: IntType!, $skip: IntType!) {
        allUploads(first: $first, skip: $skip) {
          id
          url
          filename
          alt
          title
          format
          size
          width
          height
          mimeType
          focalPoint {
            x
            y
          }
          customData
        }
      }
    `

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiToken}`,
    }

    if (environment) {
      headers['X-Environment'] = environment
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        query,
        variables: { first, skip },
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`DatoCMS API error (${response.status}): ${errorText}`)
    }

    const result = await response.json()

    if (result.errors) {
      throw new Error(`GraphQL errors: ${JSON.stringify(result.errors, null, 2)}`)
    }

    const uploads = result.data?.allUploads ?? []
    allUploads.push(...uploads)

    console.log(`Fetched ${allUploads.length} uploads so far...`)

    // If we got fewer items than requested, we've reached the end
    hasMore = uploads.length === first
    skip += first
  }

  console.log(`Total uploads found: ${allUploads.length}`)
  return allUploads
}

/**
 * Download a single file from URL
 */
const downloadFile = async (url: string, outputPath: string): Promise<void> => {
  const response = await fetch(url)

  if (!response.ok) {
    throw new Error(`Failed to download ${url}: ${response.status} ${response.statusText}`)
  }

  if (!response.body) {
    throw new Error(`No response body for ${url}`)
  }

  // Ensure the output directory exists
  const outputDir = path.dirname(outputPath)
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  // Write the file
  const fileStream = fs.createWriteStream(outputPath)
  await pipeline(response.body as any, fileStream)
}

/**
 * Sanitize filename to be filesystem-safe
 */
const sanitizeFilename = (filename: string): string => {
  return filename.replace(/[^a-z0-9._-]/gi, '_')
}

/**
 * Download all uploads to the output directory
 */
const downloadAllImages = async (uploads: DatoCMSUpload[], outputDir: string): Promise<void> => {
  // Create output directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  // Save metadata file
  const metadataPath = path.join(outputDir, 'metadata.json')
  fs.writeFileSync(metadataPath, JSON.stringify(uploads, null, 2))
  console.log(`Saved metadata to ${metadataPath}`)

  // Download each file
  let downloaded = 0
  let skipped = 0
  let failed = 0

  for (const upload of uploads) {
    try {
      const sanitizedFilename = sanitizeFilename(upload.filename)
      const outputPath = path.join(outputDir, sanitizedFilename)

      // Skip if file already exists
      if (fs.existsSync(outputPath)) {
        console.log(`⏭️  Skipped (already exists): ${sanitizedFilename}`)
        skipped++
        continue
      }

      // Download the file
      await downloadFile(upload.url, outputPath)
      downloaded++
      console.log(`✅ Downloaded: ${sanitizedFilename} (${downloaded}/${uploads.length})`)
    } catch (error) {
      failed++
      console.error(`❌ Failed to download ${upload.filename}:`, error)
    }
  }

  console.log('\n📊 Download Summary:')
  console.log(`✅ Downloaded: ${downloaded}`)
  console.log(`⏭️  Skipped: ${skipped}`)
  console.log(`❌ Failed: ${failed}`)
  console.log(`📁 Total files: ${uploads.length}`)
}

/**
 * Main function
 */
const main = async () => {
  try {
    const options = parseArgs()

    console.log('🚀 Starting DatoCMS image download...')
    console.log(`📁 Output directory: ${options.outputDir}`)
    if (options.environment) {
      console.log(`🌍 Environment: ${options.environment}`)
    }
    console.log()

    // Fetch all uploads
    const uploads = await fetchAllUploads(options.apiToken, options.environment)

    if (uploads.length === 0) {
      console.log('⚠️  No uploads found in DatoCMS.')
      return
    }

    // Download all images
    await downloadAllImages(uploads, options.outputDir)

    console.log('\n✨ Done!')
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

void main()
