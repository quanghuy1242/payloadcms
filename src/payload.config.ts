import { sqliteAdapter } from '@payloadcms/db-sqlite'
import { r2Storage } from '@payloadcms/storage-r2'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { seoPlugin } from '@payloadcms/plugin-seo'
import path from 'path'
import { buildConfig } from 'payload'
import { fileURLToPath } from 'url'

import { Bookmarks } from './collections/Bookmarks'
import { Categories } from './collections/Categories'
import { Chapters } from './collections/Chapters'
import { Posts } from './collections/Posts'
import { ReadingProgress } from './collections/ReadingProgress'
import { Users } from './collections/Users'
import { Media } from './collections/Media'
import { Books } from './collections/Books'
import { GrantMirror } from './collections/GrantMirror'
import { DeferredGrants } from './collections/DeferredGrants'
import { getR2PublicBaseUrl } from './lib/env'
import { generateSeoDescription, generateSeoImage, generateSeoTitle } from './lib/postsSeo'
import { createR2BucketFromEnv } from './lib/r2Bucket'
import { Homepage } from './globals/Homepage'
import { resolveTursoConnection } from './lib/turso'
import { mutations, queries } from './graphql'

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
  cors: ['https://blog.quanghuy.dev'],
  csrf: ['https://blog.quanghuy.dev'],
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
    components: {
      beforeLogin: ['./components/admin/BetterAuthLoginRedirect.tsx'],
      logout: {
        Button: './components/admin/BetterAuthLogout.tsx',
      },
      views: {
        booksImport: {
          Component: './components/admin/books/BookImportAdminView.tsx',
          exact: true,
          path: '/books/import',
        },
      },
    },
    autoRefresh: true, // Enable automatic token refresh to keep users logged in
  },
  collections: [Users, Media, Books, Chapters, Posts, Categories, GrantMirror, DeferredGrants, ReadingProgress, Bookmarks],
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
    disableIntrospectionInProduction: false,
    mutations,
    queries,
  },
})
