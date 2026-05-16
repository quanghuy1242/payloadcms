import { cloudflare } from '@cloudflare/vite-plugin'
import { fileURLToPath } from 'node:url'
import vinext from 'vinext'
import { defineConfig } from 'vite'

export default defineConfig({
  resolve: {
    alias: {
      '@payloadcms/ui/rsc': fileURLToPath(new URL('./src/vinext/payload-ui-rsc-shim.js', import.meta.url)),
    },
  },
  plugins: [
    vinext(),
    cloudflare({
      viteEnvironment: {
        name: 'rsc',
        childEnvironments: ['ssr'],
      },
    }),
  ],
})
