type ErrorPayload = {
  errors?: Array<{ message?: string }>
  message?: string
}

export class HttpRequestError extends Error {
  readonly payload: unknown
  readonly status: number

  constructor(message: string, status: number, payload: unknown) {
    super(message)
    this.name = 'HttpRequestError'
    this.payload = payload
    this.status = status
  }
}

export type RequestTransportOptions = {
  credentials?: RequestCredentials
  signal?: AbortSignal
}

export type RequestJSONWithRetryOptions = RequestTransportOptions & {
  onRetry?: (attempt: number, retries: number) => void
  retryDelayMs?: number
  retries?: number
}

type DocumentEnvelope<T> = {
  doc?: T
}

const DEFAULT_RETRY_COUNT = 2
const DEFAULT_RETRY_DELAY_MS = 400

const delay = async (milliseconds: number): Promise<void> => {
  await new Promise<void>((resolve) => {
    setTimeout(resolve, Math.max(0, milliseconds))
  })
}

const parseJSONResponse = async (response: Response): Promise<unknown> => {
  const text = await response.text()

  if (text.length === 0) {
    return null
  }

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

const extractErrorMessage = (fallbackMessage: string, payload: unknown): string => {
  if (typeof payload === 'string') {
    const trimmed = payload.trim()

    return trimmed.length > 0 ? trimmed : fallbackMessage
  }

  if (!payload || typeof payload !== 'object') {
    return fallbackMessage
  }

  const responsePayload = payload as ErrorPayload
  const firstError = responsePayload.errors?.find((error) => typeof error.message === 'string')

  if (firstError?.message) {
    return firstError.message
  }

  if (typeof responsePayload.message === 'string' && responsePayload.message.length > 0) {
    return responsePayload.message
  }

  return fallbackMessage
}

const shouldRetry = (error: unknown): boolean => {
  return !(error instanceof HttpRequestError) || error.status >= 500
}

export const requestJSON = async <T>(
  url: string,
  init: RequestInit = {},
  options: RequestTransportOptions = {},
): Promise<T> => {
  const response = await fetch(url, {
    ...init,
    credentials: options.credentials ?? init.credentials ?? 'include',
    signal: options.signal ?? init.signal,
  })
  const payload = await parseJSONResponse(response)

  if (!response.ok) {
    throw new HttpRequestError(
      extractErrorMessage(`Request failed with status ${response.status}.`, payload),
      response.status,
      payload,
    )
  }

  return payload as T
}

export const requestJSONWithRetry = async <T>(
  url: string,
  init: RequestInit = {},
  options: RequestJSONWithRetryOptions = {},
): Promise<T> => {
  const retries = options.retries ?? DEFAULT_RETRY_COUNT
  const retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await requestJSON<T>(url, init, options)
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw error
      }

      if (!shouldRetry(error)) {
        throw error
      }

      if (attempt < retries) {
        options.onRetry?.(attempt + 1, retries)
        await delay(retryDelayMs * (attempt + 1))
        continue
      }

      throw error
    }
  }

  throw new Error('Unexpected retry state while performing request.')
}

const unwrapDocumentResponse = <T>(payload: T | DocumentEnvelope<T>): T => {
  if (payload && typeof payload === 'object' && 'doc' in payload) {
    const envelope = payload as DocumentEnvelope<T>

    if (envelope.doc != null) {
      return envelope.doc
    }
  }

  return payload as T
}

export const requestDocumentJSONWithRetry = async <T>(
  url: string,
  init: RequestInit = {},
  options: RequestJSONWithRetryOptions = {},
): Promise<T> => {
  const payload = await requestJSONWithRetry<T | DocumentEnvelope<T>>(url, init, options)

  return unwrapDocumentResponse(payload)
}