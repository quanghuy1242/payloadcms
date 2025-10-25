import type { FileData } from 'payload'

/**
 * Generates a low-res image URL using R2 URL transformation.
 * Used for creating blur placeholders or thumbnails.
 * Maintains aspect ratio by only specifying width.
 */
export const generateLowResUrl = (fileUrl: string): string => {
  // Extract the base URL and filename
  const url = new URL(fileUrl)
  const baseUrl = `${url.protocol}//${url.host}`
  const filename = url.pathname

  // R2 transformation parameters for a 20px wide, very low quality blur image
  // fit=scale-down ensures aspect ratio is maintained
  // Only width is specified, height will be calculated automatically
  // format=webp for smallest file size (typically 30-50% smaller than JPEG)
  // Note: AVIF input files are automatically converted to WebP by Cloudflare
  const transformParams = 'width=20,quality=20,fit=scale-down,blur=10,format=webp'

  return `${baseUrl}/cdn-cgi/image/${transformParams}${filename}`
}

/**
 * Fetches the low-res image from R2 transformation URL and returns as base64 data URL.
 */
export const fetchLowResImageAsBase64 = async (lowResUrl: string): Promise<string> => {
  const headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
  }

  const response = await fetch(lowResUrl, { headers })

  if (!response.ok) {
    throw new Error(
      `Failed to fetch low-res image (${response.status} ${response.statusText}): ${lowResUrl}. ` +
        `This may indicate that the image format is not supported by Cloudflare's image transformation service. ` +
        `Supported formats: JPEG, PNG, GIF, WebP. AVIF support may be limited.`,
    )
  }

  const arrayBuffer = await response.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  // WebP format is forced in the transformation, so content-type should be image/webp
  const contentType = response.headers.get('content-type') || 'image/webp'

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
 * Generates an optimized (1920px) image URL using R2 URL transformation.
 * Used for serving web-optimized versions of high-res images.
 */
export const generateOptimizedUrl = (fileUrl: string): string => {
  // Extract the base URL and filename
  const url = new URL(fileUrl)
  const baseUrl = `${url.protocol}//${url.host}`
  const filename = url.pathname

  // R2 transformation parameters for 1920px wide optimized image
  // fit=scale-down ensures aspect ratio is maintained
  // format=webp for best compression with quality
  // quality=75 for good balance between size and quality
  const transformParams = 'width=1920,quality=75,fit=scale-down,format=webp'

  return `${baseUrl}/cdn-cgi/image/${transformParams}${filename}`
}

/**
 * Fetches the optimized image from R2 transformation URL and returns as Buffer.
 */
export const fetchOptimizedImage = async (optimizedUrl: string): Promise<Buffer> => {
  const headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
  }

  const response = await fetch(optimizedUrl, { headers })

  if (!response.ok) {
    throw new Error(
      `Failed to fetch optimized image (${response.status} ${response.statusText}): ${optimizedUrl}. ` +
        `This may indicate that the image format is not supported by Cloudflare's image transformation service.`,
    )
  }

  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

/**
 * Generates a filename for the optimized version.
 */
export const getOptimizedFilename = (originalFilename: string): string => {
  const lastDotIndex = originalFilename.lastIndexOf('.')
  if (lastDotIndex === -1) {
    return `${originalFilename}-optimized.webp`
  }

  const name = originalFilename.slice(0, lastDotIndex)
  return `${name}-optimized.webp`
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

/**
 * Responsive image variant configuration
 */
export type ResponsiveVariant = {
  width: number
  height: number
  quality: number
  fit: string
  format: string
}

export const RESPONSIVE_VARIANTS: ResponsiveVariant[] = [
  { width: 480, height: 240, quality: 75, fit: 'cover', format: 'webp' },
  { width: 640, height: 320, quality: 75, fit: 'cover', format: 'webp' },
  { width: 750, height: 375, quality: 75, fit: 'cover', format: 'webp' },
  { width: 828, height: 414, quality: 75, fit: 'cover', format: 'webp' },
  { width: 1080, height: 540, quality: 75, fit: 'cover', format: 'webp' },
  { width: 1200, height: 600, quality: 75, fit: 'cover', format: 'webp' },
]

/**
 * Generates a transformation URL for a specific responsive variant
 */
export const generateResponsiveVariantUrl = (
  fileUrl: string,
  variant: ResponsiveVariant,
): string => {
  const url = new URL(fileUrl)
  const baseUrl = `${url.protocol}//${url.host}`
  const filename = url.pathname

  const transformParams = `width=${variant.width},height=${variant.height},quality=${variant.quality},fit=${variant.fit},format=${variant.format}`

  return `${baseUrl}/cdn-cgi/image/${transformParams}${filename}`
}

/**
 * Generates a filename for a responsive variant
 */
export const getResponsiveVariantFilename = (
  originalFilename: string,
  variant: ResponsiveVariant,
): string => {
  const lastDotIndex = originalFilename.lastIndexOf('.')
  const name = lastDotIndex === -1 ? originalFilename : originalFilename.slice(0, lastDotIndex)

  return `${name}-${variant.width}x${variant.height}.${variant.format}`
}

/**
 * Fetches a responsive variant image from R2 transformation URL
 */
export const fetchResponsiveVariant = async (variantUrl: string): Promise<Buffer> => {
  const headers = {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
  }

  const response = await fetch(variantUrl, { headers })

  if (!response.ok) {
    throw new Error(
      `Failed to fetch responsive variant (${response.status} ${response.statusText}): ${variantUrl}`,
    )
  }

  const arrayBuffer = await response.arrayBuffer()
  return Buffer.from(arrayBuffer)
}
