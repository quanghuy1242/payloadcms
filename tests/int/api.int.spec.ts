import { getPayload, Payload } from 'payload'
import config from '@/payload.config'

import { describe, it, beforeAll, expect } from 'vitest'

let payload: Payload

describe('API', () => {
  beforeAll(async () => {
    const payloadConfig = await config
    payload = await getPayload({ config: payloadConfig })
  })

  it('fetches users', async () => {
    const users = await payload.find({
      collection: 'users',
    })
    expect(users).toBeDefined()
  })

  it('fetches the books and chapters collections', async () => {
    const [books, chapters] = await Promise.all([
      payload.find({
        collection: 'books',
        overrideAccess: true,
      }),
      payload.find({
        collection: 'chapters',
        overrideAccess: true,
      }),
    ])

    expect(books).toBeDefined()
    expect(chapters).toBeDefined()
  })
})
