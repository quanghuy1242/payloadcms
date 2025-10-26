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
import { getR2PublicBaseUrl } from './lib/env'
import { generateSeoDescription, generateSeoImage, generateSeoTitle } from './lib/postsSeo'
import { createR2BucketFromEnv } from './lib/r2Bucket'
import { Homepage } from './globals/Homepage'
import { resolveTursoConnection } from './lib/turso'
import { queries } from './graphql'
import { attachBetterAuthAdminMiddleware } from './lib/betterAuth/middleware'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)
const isProduction = process.env.NODE_ENV === 'production'
const isNextBuild = process.env.NEXT_PHASE === 'phase-production-build'
const fallbackSQLiteFile = path.resolve(dirname, '../.payload/data.sqlite')
const r2Bucket = createR2BucketFromEnv({ strict: !isNextBuild })
const r2PublicBaseUrl = getR2PublicBaseUrl()

const tursoConnection = resolveTursoConnection({
  authToken: process.env.TURSO_AUTH_TOKEN,
  fallbackSQLiteFile,
  isNextBuild,
  isProduction,
  tursoDatabaseURL: process.env.TURSO_DATABASE_URL,
})

const databaseAdapter = sqliteAdapter({
  client: {
    url: tursoConnection.connectionString,
    authToken: tursoConnection.authToken,
  },
  push: tursoConnection.shouldSync,
})

const storagePlugins = r2Bucket
  ? [
      r2Storage({
        bucket: r2Bucket,
        collections: {
          media: r2PublicBaseUrl
            ? {
                generateFileURL: async ({ filename, prefix }) => {
                  const pathSegments = [prefix, filename]
                    .filter(
                      (segment): segment is string =>
                        typeof segment === 'string' && segment.length > 0,
                    )
                    .flatMap((segment) => segment.split('/').filter((part) => part.length > 0))

                  const encodedKey = pathSegments.map(encodeURIComponent).join('/')

                  return `${r2PublicBaseUrl}/${encodedKey}`
                },
              }
            : true,
        },
      }),
    ]
  : []

const seo = seoPlugin({
  collections: ['posts'],
  globals: ['homepage'],
  uploadsCollection: 'media',
  generateTitle: generateSeoTitle,
  generateDescription: generateSeoDescription,
  generateImage: generateSeoImage,
  tabbedUI: true,
})

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
    components: {
      afterNavLinks: [path.resolve(dirname, './components/admin/BetterAuthLogout.tsx')],
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
    queries,
  },
  onInit: async (payload) => {
    attachBetterAuthAdminMiddleware(payload)
  },
})
