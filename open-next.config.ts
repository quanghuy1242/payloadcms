import { defineCloudflareConfig } from '@opennextjs/cloudflare'

const config = defineCloudflareConfig({})

export default {
  ...config,
  cloudflare: {
    ...config.cloudflare,
    // Payload's libsql stack trips the workerd condition path during OpenNext bundling.
    // Keep this disabled until upstream OpenNext/Payload no longer needs the fallback.
    useWorkerdCondition: false,
  },
  // OpenNext must use the same Turbopack build path as the Vercel-target Next build.
  buildCommand: 'pnpm exec next build --turbopack',
}
