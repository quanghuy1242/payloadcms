import { Client, Receiver } from '@upstash/qstash'

import {
  getQStashBaseUrl,
  getQStashCurrentSigningKey,
  getQStashNextSigningKey,
  getQStashToken,
  resolveQueueTargetBaseUrl,
} from '@/lib/env'

export const QSTASH_SIGNATURE_HEADER = 'Upstash-Signature'

let cachedQStashClient: Client | undefined
let cachedQStashReceiver: Receiver | undefined

const getQStashClient = (): Client => {
  if (cachedQStashClient !== undefined) {
    return cachedQStashClient
  }

  cachedQStashClient = new Client({
    token: getQStashToken(),
    baseUrl: getQStashBaseUrl(),
  })

  return cachedQStashClient
}

const getQStashReceiver = (): Receiver => {
  if (cachedQStashReceiver !== undefined) {
    return cachedQStashReceiver
  }

  cachedQStashReceiver = new Receiver({
    currentSigningKey: getQStashCurrentSigningKey(),
    nextSigningKey: getQStashNextSigningKey(),
  })

  return cachedQStashReceiver
}

export const resolveQueueTargetUrl = (path: string): string => {
  return `${resolveQueueTargetBaseUrl()}${path}`
}

export const publishQStashJson = async <T>(
  path: string,
  body: T,
  retries = 3,
): Promise<void> => {
  await getQStashClient().publishJSON({
    url: resolveQueueTargetUrl(path),
    body,
    retries,
  })
}

export const verifyQStashSignature = async (
  body: string,
  signature: string,
  path: string,
): Promise<void> => {
  await getQStashReceiver().verify({
    signature,
    body,
    url: resolveQueueTargetUrl(path),
  })
}