import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { r2Storage } from '@payloadcms/storage-r2'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { seoPlugin } from '@payloadcms/plugin-seo'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'

import type {
  GenerateDescription,
  GenerateImage,
  GenerateTitle,
} from '@payloadcms/plugin-seo/types'
import { Categories } from './collections/Categories'
import { Posts } from './collections/Posts'
import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { createR2BucketFromEnv } from './lib/r2Bucket'
import { Homepage } from './globals/Homepage'
import type { Post } from './payload-types'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)
const isProduction = process.env.NODE_ENV === 'production'
const isNextBuild = process.env.NEXT_PHASE === 'phase-production-build'
const tursoDatabaseURL = process.env.TURSO_DATABASE_URL
const tursoAuthToken = process.env.TURSO_AUTH_TOKEN
const fallbackSQLiteFile = path.resolve(dirname, '../.payload/data.sqlite')
const r2Bucket = createR2BucketFromEnv({ strict: !isNextBuild })

if (!tursoDatabaseURL && isProduction && !isNextBuild) {
  throw new Error('TURSO_DATABASE_URL must be set in production to connect to Turso.')
}

if (!tursoDatabaseURL && !isNextBuild) {
  console.warn(
    `TURSO_DATABASE_URL is not set. Falling back to local SQLite file at ${fallbackSQLiteFile}.`,
  )
}

const databaseAdapter = sqliteAdapter({
  client: {
    url: tursoDatabaseURL ?? `file:${fallbackSQLiteFile}`,
    authToken: tursoDatabaseURL ? tursoAuthToken : undefined,
  },
  push: !isProduction || isNextBuild,
})
const storagePlugins = r2Bucket
  ? [
      r2Storage({
        bucket: r2Bucket,
        collections: {
          media: true,
        },
      }),
    ]
  : []

const generatePostTitle: GenerateTitle<Post> = ({ doc }) => {
  if (typeof doc?.title === 'string') {
    return doc.title.trim()
  }

  return ''
}

const generatePostDescription: GenerateDescription<Post> = ({ doc }) => {
  if (typeof doc?.excerpt === 'string') {
    return doc.excerpt
  }

  return ''
}

const generatePostImage: GenerateImage<Post> = ({ doc }) => {
  const { coverImage } = doc ?? {}

  if (coverImage && typeof coverImage === 'object') {
    if ('id' in coverImage && coverImage.id) {
      return coverImage.id as string | number
    }
  }

  return (coverImage ?? '') as string | number
}

const seo = seoPlugin({
  collections: ['posts'],
  uploadsCollection: 'media',
  generateTitle: generatePostTitle,
  generateDescription: generatePostDescription,
  generateImage: generatePostImage,
})

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
  },
  collections: [Users, Media, Posts, Categories],
  editor: lexicalEditor({}),
  secret: process.env.PAYLOAD_SECRET || '',
  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
  // @ts-ignore
  db: databaseAdapter,
  globals: [Homepage],
  // @ts-ignore
  plugins: [...storagePlugins, seo],
})
