import { withPayload } from '@payloadcms/next/withPayload'

/** @type {import('next').NextConfig} */
const nextConfig = {
  productionBrowserSourceMaps: true,
  serverExternalPackages: ['@libsql/client', 'libsql'],
}

export default withPayload(nextConfig, { devBundleServerPackages: false })
