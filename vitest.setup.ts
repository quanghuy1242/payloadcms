// Any setup scripts you might need go here

// Load .env files
import 'dotenv/config'

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
