import type { FileData } from 'payload'

/**
 * Generates a low-res image URL using R2 URL transformation.
 * Used for creating blur placeholders or thumbnails.
 */
export const generateLowResUrl = (fileUrl: string): string => {
  // Extract the base URL and filename
  const url = new URL(fileUrl)
  const baseUrl = `${url.protocol}//${url.host}`
  const filename = url.pathname

  // R2 transformation parameters for a 20px wide, very low quality blur image
  const transformParams = 'width=20,quality=20,blur=10'

  return `${baseUrl}/cdn-cgi/image/${transformParams}${filename}`
}

/**
 * Fetches the low-res image from R2 transformation URL and returns as base64 data URL.
 */
export const fetchLowResImageAsBase64 = async (lowResUrl: string): Promise<string> => {
  const response = await fetch(lowResUrl)

  if (!response.ok) {
    throw new Error(`Failed to fetch low-res image: ${response.statusText}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  // Get content-type from response or default to jpeg
  const contentType = response.headers.get('content-type') || 'image/jpeg'

  // Return base64 data URL
  return `data:${contentType};base64,${buffer.toString('base64')}`
}

/**
 * Generates a filename for the low-res version.
 */
export const getLowResFilename = (originalFilename: string): string => {
  const lastDotIndex = originalFilename.lastIndexOf('.')
  if (lastDotIndex === -1) {
    return `${originalFilename}-lowres`
  }

  const name = originalFilename.slice(0, lastDotIndex)
  const ext = originalFilename.slice(lastDotIndex)

  return `${name}-lowres${ext}`
}

/**
 * Extracts the storage key from a file's data.
 */
export const getStorageKey = (file: FileData): string | null => {
  if (!file.filename) return null

  // If there's a prefix, combine it with the filename
  const prefix = (file as any).prefix
  if (prefix) {
    return `${prefix}/${file.filename}`
  }

  return file.filename
}
