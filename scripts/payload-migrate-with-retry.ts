import { spawn } from 'node:child_process'
import process from 'node:process'

type RunResult = {
  code: number | null
  output: string
  signal: NodeJS.Signals | null
}

const DEFAULT_MAX_ATTEMPTS = 3
const BASE_RETRY_DELAY_MS = 1_500

const transientErrorPatterns = [
  'fetch failed',
  'other side closed',
  'und_err_socket',
  'econnreset',
  'socket hang up',
]

const sleep = (durationMs: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, durationMs))
}

const parseMaxAttempts = (): number => {
  const value = Number(process.env.PAYLOAD_MIGRATE_MAX_ATTEMPTS)

  if (Number.isInteger(value) && value > 0) {
    return value
  }

  return DEFAULT_MAX_ATTEMPTS
}

const isTransientMigrationFailure = (output: string): boolean => {
  const normalized = output.toLowerCase()

  return transientErrorPatterns.some((pattern) => normalized.includes(pattern))
}

const runPayloadMigrate = (): Promise<RunResult> => {
  return new Promise((resolve, reject) => {
    let output = ''
    const child = spawn('payload', ['migrate'], {
      env: process.env,
      stdio: ['inherit', 'pipe', 'pipe'],
    })

    child.stdout.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      output += text
      process.stdout.write(text)
    })

    child.stderr.on('data', (chunk: Buffer) => {
      const text = chunk.toString()
      output += text
      process.stderr.write(text)
    })

    child.on('error', reject)
    child.on('close', (code, signal) => {
      resolve({ code, output, signal })
    })
  })
}

const main = async (): Promise<void> => {
  const maxAttempts = parseMaxAttempts()

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (attempt > 1) {
      console.info(`[migrate] Retrying payload migrate (${attempt}/${maxAttempts})...`)
    }

    const result = await runPayloadMigrate()

    if (result.code === 0) {
      return
    }

    const transient = isTransientMigrationFailure(result.output)
    const canRetry = transient && attempt < maxAttempts

    if (!canRetry) {
      const suffix = result.signal ? ` signal ${result.signal}` : ` exit code ${result.code ?? 'unknown'}`
      throw new Error(`payload migrate failed with${suffix}.`)
    }

    const delayMs = BASE_RETRY_DELAY_MS * attempt
    console.warn(
      `[migrate] payload migrate failed with a transient database transport error. Waiting ${delayMs}ms before retry.`,
    )
    await sleep(delayMs)
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})
