import { getPayload } from 'payload'
import configPromise from '@payload-config'

import { QSTASH_SIGNATURE_HEADER, verifyQStashSignature } from '@/lib/qstash'
import {
  DEFERRED_GRANTS_QUEUE_PATH,
  processDeferredGrantJob,
  type DeferredGrantJob,
} from '@/utils/deferredGrants'

const parseDeferredGrantJob = (body: string): DeferredGrantJob => {
  return JSON.parse(body) as DeferredGrantJob
}

export async function POST(request: Request): Promise<Response> {
  const body = await request.text()
  const signature = request.headers.get(QSTASH_SIGNATURE_HEADER)

  if (!signature) {
    return new Response('missing-signature', { status: 400 })
  }

  try {
    await verifyQStashSignature(body, signature, DEFERRED_GRANTS_QUEUE_PATH)
  } catch (error) {
    console.error('[deferred-grants-queue] Invalid QStash signature:', error)
    return new Response('invalid-signature', { status: 401 })
  }

  let job: DeferredGrantJob

  try {
    job = parseDeferredGrantJob(body)
  } catch (error) {
    console.error('[deferred-grants-queue] Invalid job body:', error)
    return new Response('invalid-body', { status: 400 })
  }

  if (!job.id || job.deferredGrantId == null || !job.betterAuthUserId || !job.queuedAt) {
    return new Response('invalid-body', { status: 400 })
  }

  const payload = await getPayload({ config: configPromise })

  try {
    const result = await processDeferredGrantJob(payload, job)

    if (result === 'pending') {
      return new Response('user-not-ready', { status: 500 })
    }

    return new Response(result, { status: 200 })
  } catch (error) {
    console.error('[deferred-grants-queue] Failed to process deferred grant job:', {
      deferredGrantId: job.deferredGrantId,
      error,
      jobId: job.id,
    })

    return new Response('processing-error', { status: 500 })
  }
}
