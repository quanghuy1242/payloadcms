import { withPayload } from '@payloadcms/next/withPayload'

/** @type {import('next').NextConfig} */
const nextConfig = {
  productionBrowserSourceMaps: true,

  // Enable React Compiler (stable in Next.js 16)
  reactCompiler: true,

  // Handle PayloadCMS and database dependencies
  serverExternalPackages: [
    'libsql',
    '@libsql/client',
    'drizzle-kit',
    'esbuild',
    'esbuild-register',
    '@payloadcms/db-sqlite',
    '@payloadcms/drizzle',
  ],

  // Enable Turbopack filesystem cache for dev (Next.js 16 feature)
  experimental: {
    turbopackFileSystemCacheForDev: true,
  },

  // Your Next.js config here
  webpack: (webpackConfig) => {
    webpackConfig.resolve.extensionAlias = {
      '.cjs': ['.cts', '.cjs'],
      '.js': ['.ts', '.tsx', '.js', '.jsx'],
      '.mjs': ['.mts', '.mjs'],
    }

    return webpackConfig
  },
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
