import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { r2Storage } from '@payloadcms/storage-r2'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { seoPlugin } from '@payloadcms/plugin-seo'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'

import { Categories } from './collections/Categories'
import { Posts } from './collections/Posts'
import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { createQueriesExtension } from './graphql/queries'
import { generatePostDescription, generatePostImage, generatePostTitle } from './lib/postsSeo'
import { createR2BucketFromEnv } from './lib/r2Bucket'
import { Homepage } from './globals/Homepage'

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
  graphQL: {
    disablePlaygroundInProduction: false,
    queries: createQueriesExtension,
  },
})
