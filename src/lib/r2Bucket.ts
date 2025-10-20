import {
  AbortMultipartUploadCommand,
  CompleteMultipartUploadCommand,
  CreateMultipartUploadCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  UploadPartCommand,
} from '@aws-sdk/client-s3'
import { Readable } from 'node:stream'
import { ReadableStream as NodeReadableStream } from 'node:stream/web'

type PutValue =
  | ArrayBuffer
  | ArrayBufferView
  | Blob
  | ReadableStream
  | Readable
  | Uint8Array
  | string
  | null
type MultipartPart = { etag?: string; partNumber: number }

type R2Bucket = {
  put: (key: string, value: PutValue, options?: Record<string, unknown>) => Promise<unknown>
  get: (
    key: string,
    options?: Record<string, unknown>,
  ) => Promise<{
    body: ReadableStream
    etag?: string
    writeHttpMetadata: (headers: Headers) => void
  } | null>
  delete: (keys: string | string[]) => Promise<void>
  head: (key: string) => Promise<unknown>
  list: (options?: Record<string, unknown>) => Promise<unknown>
  createMultipartUpload: (key: string, options?: Record<string, unknown>) => Promise<unknown>
  resumeMultipartUpload: (
    key: string,
    uploadId: string,
  ) => {
    uploadId: string
    key: string
    uploadPart: (partNumber: number, value: PutValue) => Promise<{ etag?: string }>
    complete: (parts: MultipartPart[]) => Promise<unknown>
    abort: () => Promise<void>
  }
}

const isReadableStream = (value: unknown): value is ReadableStream => {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as ReadableStream).getReader === 'function'
  )
}

const toNodeBody = async (value: PutValue): Promise<Readable | Uint8Array | string | undefined> => {
  if (value == null) {
    return undefined
  }

  if (typeof value === 'string') {
    return value
  }

  if (ArrayBuffer.isView(value)) {
    return value instanceof Uint8Array
      ? value
      : new Uint8Array(value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength))
  }

  if (value instanceof ArrayBuffer) {
    return new Uint8Array(value)
  }

  if (typeof Blob !== 'undefined' && value instanceof Blob) {
    return Buffer.from(await value.arrayBuffer())
  }

  if (isReadableStream(value)) {
    return Readable.fromWeb(value as unknown as NodeReadableStream)
  }

  if (value instanceof Readable) {
    return value
  }

  throw new Error('Unsupported body type passed to R2 bucket adapter.')
}

const toWebBody = (body: unknown): ReadableStream | null => {
  if (!body) {
    return null
  }

  if (
    typeof (body as { transformToWebStream?: () => ReadableStream }).transformToWebStream ===
    'function'
  ) {
    return (body as { transformToWebStream: () => ReadableStream }).transformToWebStream()
  }

  if (isReadableStream(body)) {
    return body
  }

  if (body instanceof Readable) {
    return Readable.toWeb(body) as unknown as ReadableStream
  }

  if (typeof Blob !== 'undefined' && body instanceof Blob) {
    return body.stream()
  }

  if (body instanceof Uint8Array || typeof body === 'string') {
    const nodeStream = Readable.from([body])
    return Readable.toWeb(nodeStream) as unknown as ReadableStream
  }

  return null
}

const getRangeHeader = (options?: { range?: unknown }): string | undefined => {
  const { range } = options ?? {}

  if (!range) {
    return undefined
  }

  if (typeof range === 'string') {
    return range
  }

  if (typeof Headers !== 'undefined' && range instanceof Headers) {
    return range.get('range') ?? undefined
  }

  if (typeof (range as { get?: (key: string) => string | null }).get === 'function') {
    return (range as { get: (key: string) => string | null }).get('range') ?? undefined
  }

  return undefined
}

const normalizeKey = (key: string): string => key.replace(/^\/+/, '')

type BucketOptions = {
  /**
   * When true, missing environment variables will throw an error.
   * Defaults to true when NODE_ENV === 'production'.
   */
  strict?: boolean
}

export const createR2BucketFromEnv = (options?: BucketOptions): R2Bucket | null => {
  const endpoint = process.env.R2_ENDPOINT
  const bucketName = process.env.R2_BUCKET_NAME
  const accessKeyId = process.env.R2_ACCESS_KEY_ID
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY
  const strict = options?.strict ?? process.env.NODE_ENV === 'production'

  const missingVars = [
    ['R2_ENDPOINT', endpoint],
    ['R2_BUCKET_NAME', bucketName],
    ['R2_ACCESS_KEY_ID', accessKeyId],
    ['R2_SECRET_ACCESS_KEY', secretAccessKey],
  ].filter(([, value]) => !value)

  if (missingVars.length > 0) {
    const message = `Missing Cloudflare R2 environment variables: ${missingVars
      .map(([key]) => key)
      .join(', ')}`

    if (strict) {
      throw new Error(message)
    }

    console.warn(message)

    return null
  }

  const client = new S3Client({
    endpoint,
    region: 'auto',
    credentials: {
      accessKeyId: accessKeyId as string,
      secretAccessKey: secretAccessKey as string,
    },
    forcePathStyle: true,
  })

  const bucket: R2Bucket = {
    async put(key, value): Promise<unknown> {
      const Body = await toNodeBody(value)
      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: normalizeKey(key),
        ...(Body !== undefined ? { Body } : {}),
      })

      return client.send(command)
    },
    async get(
      key,
      options?: {
        range?: unknown
      },
    ): Promise<{
      body: ReadableStream
      etag?: string
      writeHttpMetadata: (headers: Headers) => void
    } | null> {
      const Range = getRangeHeader(options)
      const command = new GetObjectCommand({
        Bucket: bucketName,
        Key: normalizeKey(key),
        Range,
      })
      const result = await client.send(command)

      if (!result.Body) {
        return null
      }

      const body = toWebBody(result.Body)

      if (!body) {
        return null
      }

      return {
        body,
        etag: result.ETag ?? undefined,
        writeHttpMetadata: (headers: Headers) => {
          if (result.ContentType) headers.set('content-type', result.ContentType)
          if (result.CacheControl) headers.set('cache-control', result.CacheControl)
          if (result.ContentDisposition)
            headers.set('content-disposition', result.ContentDisposition)
          if (result.ContentEncoding) headers.set('content-encoding', result.ContentEncoding)
          if (result.ContentLanguage) headers.set('content-language', result.ContentLanguage)
          if (result.ContentLength != null)
            headers.set('content-length', result.ContentLength.toString())
          if (result.ETag) headers.set('etag', result.ETag)
          if (result.LastModified) headers.set('last-modified', result.LastModified.toUTCString())
        },
      }
    },
    async delete(keys: string | string[]): Promise<void> {
      if (Array.isArray(keys)) {
        if (keys.length === 0) {
          return
        }

        const command = new DeleteObjectsCommand({
          Bucket: bucketName,
          Delete: {
            Objects: keys.map((key) => ({ Key: normalizeKey(key) })),
          },
        })

        await client.send(command)

        return
      }

      const command = new DeleteObjectCommand({
        Bucket: bucketName,
        Key: normalizeKey(keys),
      })
      await client.send(command)
    },
    async head(key): Promise<unknown> {
      const command = new HeadObjectCommand({
        Bucket: bucketName,
        Key: normalizeKey(key),
      })

      return client.send(command)
    },
    async list(options?: Record<string, unknown>): Promise<unknown> {
      const command = new ListObjectsV2Command({
        Bucket: bucketName,
        ...(options ?? {}),
      })

      return client.send(command)
    },
    async createMultipartUpload(key, options?: Record<string, unknown>): Promise<unknown> {
      const command = new CreateMultipartUploadCommand({
        Bucket: bucketName,
        Key: normalizeKey(key),
        ...(options ?? {}),
      })

      return client.send(command)
    },
    resumeMultipartUpload(
      key,
      uploadId: string,
    ): {
      uploadId: string
      key: string
      uploadPart: (partNumber: number, value: PutValue) => Promise<{ etag?: string }>
      complete: (parts: MultipartPart[]) => Promise<unknown>
      abort: () => Promise<void>
    } {
      const normalizedKey = normalizeKey(key)

      return {
        uploadId,
        key: normalizedKey,
        uploadPart: async (partNumber: number, value: PutValue) => {
          const Body = await toNodeBody(value)
          const { ETag } = await client.send(
            new UploadPartCommand({
              Bucket: bucketName,
              Key: normalizedKey,
              PartNumber: partNumber,
              UploadId: uploadId,
              ...(Body !== undefined ? { Body } : {}),
            }),
          )

          return { etag: ETag }
        },
        complete: async (parts: MultipartPart[]) => {
          return client.send(
            new CompleteMultipartUploadCommand({
              Bucket: bucketName,
              Key: normalizedKey,
              UploadId: uploadId,
              MultipartUpload: {
                Parts: parts.map((part) => ({
                  ETag: part.etag,
                  PartNumber: part.partNumber,
                })),
              },
            }),
          )
        },
        abort: async () => {
          await client.send(
            new AbortMultipartUploadCommand({
              Bucket: bucketName,
              Key: normalizedKey,
              UploadId: uploadId,
            }),
          )
        },
      }
    },
  }

  return bucket
}
