import 'dotenv/config'

import path from 'node:path'
import { mkdir, rm } from 'node:fs/promises'

// Keep integration tests off the shared local DB and avoid interactive schema prompts.
const vitestSQLiteFile = path.resolve(process.cwd(), '.payload', 'vitest-data.sqlite')

process.env.CI ??= 'true'
process.env.TURSO_DATABASE_URL ??= `file:${vitestSQLiteFile}`
process.env.R2_ENDPOINT ??= 'http://localhost'
process.env.R2_BUCKET_NAME ??= 'test-bucket'
process.env.R2_ACCESS_KEY_ID ??= 'test'
process.env.R2_SECRET_ACCESS_KEY ??= 'test'
process.env.PAYLOAD_SECRET ??= 'test'

await mkdir(path.dirname(vitestSQLiteFile), { recursive: true })
await rm(vitestSQLiteFile, { force: true })

if (typeof URL !== 'undefined') {
	if (typeof URL.createObjectURL !== 'function') {
		Object.defineProperty(URL, 'createObjectURL', {
			configurable: true,
			value: () => {
				return 'blob:vitest-mock-url'
			},
			writable: true,
		})
	}

	if (typeof URL.revokeObjectURL !== 'function') {
		Object.defineProperty(URL, 'revokeObjectURL', {
			configurable: true,
			value: () => {
				return undefined
			},
			writable: true,
		})
	}
}
