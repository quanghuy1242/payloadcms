import path from 'node:path'
import process from 'node:process'

import { createClient } from '@libsql/client'

import { resolveTursoConnection } from '../src/lib/turso'
import { toNullableString } from '../src/utils/strings'

type CliOptions = {
  email: string
}

const parseArgs = (): CliOptions => {
  const emailFlagIndex = process.argv.findIndex((arg) => arg === '--email' || arg === '-e')

  if (emailFlagIndex === -1 || emailFlagIndex + 1 >= process.argv.length) {
    throw new Error('Usage: pnpm promote:admin --email user@example.com')
  }

  const emailValue = toNullableString(process.argv[emailFlagIndex + 1])

  if (!emailValue) {
    throw new Error('Email must be a non-empty string.')
  }

  return {
    email: emailValue.toLowerCase(),
  }
}

const getClient = () => {
  const fallbackSQLiteFile = path.resolve(process.cwd(), '.payload/data.sqlite')
  const connection = resolveTursoConnection({
    authToken: process.env.TURSO_AUTH_TOKEN,
    fallbackSQLiteFile,
    isNextBuild: false,
    isProduction: process.env.NODE_ENV === 'production',
    tursoDatabaseURL: process.env.TURSO_DATABASE_URL,
  })

  return createClient({
    authToken: connection.authToken,
    url: connection.connectionString,
  })
}

const promoteUser = async ({ email }: CliOptions) => {
  const client = getClient()

  const userResult = await client.execute({
    sql: 'SELECT id, role FROM users WHERE email = ? LIMIT 1',
    args: [email],
  })

  if (userResult.rows.length === 0) {
    throw new Error(`No user found with email ${email}`)
  }

  const currentRole = toNullableString(userResult.rows[0].role)

  if (currentRole === 'admin') {
    console.info(`User ${email} is already an admin.`)
    return
  }

  const updateResult = await client.execute({
    sql: `UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE email = ?`,
    args: ['admin', email],
  })

    if (Number(updateResult.rowsAffected) === 0) {
      throw new Error(`Failed to update user ${email}.`)
    }

  console.info(`User ${email} promoted to admin.`)
}

const main = async () => {
  try {
    const options = parseArgs()
    await promoteUser(options)
  } catch (error) {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  }
}

void main()
