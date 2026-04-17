import { getPayload, Payload } from 'payload'
import config from '@/payload.config'
import { chaptersReadAccess } from '@/utils/access'

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

  it('accepts the chapter visibility read filter in a real Payload query', async () => {
    await expect(
      payload.find({
        collection: 'chapters',
        depth: 0,
        limit: 1,
        overrideAccess: true,
        where: chaptersReadAccess({
          req: {
            user: null,
          },
        } as never) as never,
      }),
    ).resolves.toBeDefined()
  })
})
