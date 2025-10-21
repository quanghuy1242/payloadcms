import type { Media } from '../payload-types'

export type CloudflareImageFit =
  | 'scale-down'
  | 'contain'
  | 'cover'
  | 'crop'
  | 'pad'
  | 'fill'

export type CloudflareImageOptions = {
  fit?: CloudflareImageFit
  format?: string | null
  gravity?: string | null
  height?: number | null
  quality?: number | null
  sharpen?: number | null
  width?: number | null
}

export type CloudflareImageBuildResult = {
  directives: string
  normalizedOptions: NormalizedCloudflareImageOptions
  url: string
}

export type NormalizedCloudflareImageOptions = {
  fit: CloudflareImageFit | null
  format: string
  gravity: string | null
  height: number | null
  quality: number
  sharpen: number | null
  width: number | null
}

const DEFAULT_FORMAT_DIRECTIVE = 'format=auto'
const DEFAULT_QUALITY_DIRECTIVE = 'quality=85'

const encodePath = (path: string): string => {
  return path
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/')
}

const createDirective = (key: string, value: string | number): string => {
  return `${key}=${value}`
}

const sanitizeDimension = (value?: number | null): number | null => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return null
  }

  if (!Number.isFinite(value)) {
    return null
  }

  if (value <= 0) {
    return null
  }

  return Math.round(Math.min(value, 5000))
}

const sanitizeQuality = (value?: number | null): number | null => {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return null
  }

  if (!Number.isFinite(value)) {
    return null
  }

  const clamped = Math.round(value)

  if (clamped < 10) {
    return 10
  }

  if (clamped > 100) {
    return 100
  }

  return clamped
}

const ALLOWED_FITS: CloudflareImageFit[] = ['scale-down', 'contain', 'cover', 'crop', 'pad', 'fill']

export const normalizeCloudflareImageFit = (value?: string | null): CloudflareImageFit | null => {
  if (!value) {
    return null
  }

  const normalized = value.toLowerCase() as CloudflareImageFit

  if (!ALLOWED_FITS.includes(normalized)) {
    return null
  }

  return normalized
}

const sanitizeFormat = (value?: string | null): string | null => {
  if (!value) {
    return null
  }

  const normalized = value.toLowerCase()
  const allowedFormats = ['avif', 'webp', 'jpeg', 'jpg', 'png', 'auto']

  if (!allowedFormats.includes(normalized)) {
    return null
  }

  return normalized === 'jpg' ? 'jpeg' : normalized
}

export const resolveMediaAssetPath = (
  media: Partial<Media> & { prefix?: string | null; bucket?: string | null } | null | undefined,
  baseUrl: string,
): string | null => {
  if (!media) {
    return null
  }

  if (media.url) {
    try {
      const parsed = new URL(media.url, baseUrl)

      if (parsed.pathname) {
        return parsed.pathname.replace(/^\/+/, '')
      }
    } catch {
      const cleaned = media.url.replace(/^\/+/, '')
      if (cleaned) {
        return cleaned
      }
    }
  }

  const segments: string[] = []

  if (media.prefix) {
    segments.push(media.prefix.replace(/^\/+|\/+$/g, ''))
  }

  if (media.bucket) {
    segments.unshift(media.bucket.replace(/^\/+|\/+$/g, ''))
  }

  if (media.filename) {
    segments.push(media.filename)
  }

  if (segments.length === 0) {
    return null
  }

  return segments.join('/')
}

export const buildCloudflareImageUrl = (
  baseUrl: string,
  assetPath: string,
  options: CloudflareImageOptions = {},
): CloudflareImageBuildResult => {
  const cleanedBase = baseUrl.replace(/\/+$/, '')

  if (!cleanedBase) {
    throw new Error('CLOUDFLARE_IMAGE_BASE_URL must be configured.')
  }

  const directives: string[] = []

  const width = sanitizeDimension(options.width ?? null)
  const height = sanitizeDimension(options.height ?? null)
  const fit = normalizeCloudflareImageFit(options.fit)
  const format = sanitizeFormat(options.format) ?? DEFAULT_FORMAT_DIRECTIVE.split('=')[1]
  const quality = sanitizeQuality(options.quality ?? null) ?? Number(DEFAULT_QUALITY_DIRECTIVE.split('=')[1])
  const gravity = options.gravity ?? null
  const sharpen =
    typeof options.sharpen === 'number' && Number.isFinite(options.sharpen)
      ? Math.max(0, Math.min(Math.round(options.sharpen), 10))
      : null

  if (width) {
    directives.push(createDirective('width', width))
  }

  if (height) {
    directives.push(createDirective('height', height))
  }

  if (fit) {
    directives.push(createDirective('fit', fit))
  }

  if (format) {
    directives.push(createDirective('format', format))
  }

  if (quality) {
    directives.push(createDirective('quality', quality))
  }

  if (gravity) {
    directives.push(createDirective('gravity', gravity))
  }

  if (sharpen) {
    directives.push(createDirective('sharpen', sharpen))
  }

  if (!directives.some((directive) => directive.startsWith('format='))) {
    directives.push(DEFAULT_FORMAT_DIRECTIVE)
  }

  if (!directives.some((directive) => directive.startsWith('quality='))) {
    directives.push(DEFAULT_QUALITY_DIRECTIVE)
  }

  const sanitizedPath = encodePath(assetPath)

  if (!sanitizedPath) {
    throw new Error('Unable to determine Cloudflare image asset path.')
  }

  const directiveString = directives.join(',')

  return {
    directives: directiveString,
    normalizedOptions: {
      fit,
      format,
      gravity,
      height,
      quality,
      sharpen,
      width,
    },
    url: `${cleanedBase}/cdn-cgi/image/${directiveString}/${sanitizedPath}`,
  }
}
