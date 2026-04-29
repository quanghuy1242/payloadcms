/**
 * Browser-only EPUB export pipeline.
 *
 * Orchestrates the client-side assembly of an EPUB from paged GraphQL queries.
 * This module imports JSZip and must only run in the browser.
 */

import JSZip from 'jszip'

import {
  buildChapterDocument,
  buildContainerXml,
  buildContentOpf,
  buildNavDocument,
  buildSharedStylesheet,
  buildTocNcx,
  type ExportedAssetFile,
  type ExportedChapterFile,
} from './epubPackage'
import {
  buildExportFilename,
  createChapterArchiveName,
  createMediaArchiveName,
  resolveEpubHrefToArchivePath,
  type ExportChapterIndexEntry,
} from './epubExportHelpers'
import { lexicalToEpubHtml } from './lexicalToEpubHtml'
import { requestJSON } from './http'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type ExportPhase =
  | 'Idle'
  | 'Fetching Manifest'
  | 'Fetching Chapters'
  | 'Serializing Chapters'
  | 'Downloading Assets'
  | 'Packaging'
  | 'Done'
  | 'Failed'
  | 'Canceled'

export type EpubExportEvent =
  | { type: 'phase'; phase: ExportPhase }
  | { type: 'status'; message: string }
  | { type: 'chapters-known'; totalChapters: number }
  | { type: 'chapter-serialized'; completed: number; total: number }
  | { type: 'asset-downloaded'; completed: number; total: number }
  | { type: 'warning'; message: string }
  | { type: 'done'; blob: Blob; filename: string }

export type EpubExportPipelineConfig = {
  bookId: string | number
  signal: AbortSignal
}

type ManifestResponse = {
  errors?: Array<{ message?: string }>
  data: {
    bookExportManifest: {
      filename: string
      pageSize: number
      totalChapters: number
      totalPages: number
      book: {
        id: string | number
        title: string
        slug: string
        author?: string | null
        description?: string | null
        language?: string | null
        publisher?: string | null
        publicationDate?: string | null
        isbn?: string | null
        epubVersion?: string | null
        updatedAt?: string | null
        cover?: {
          id: string | number
          filename: string
          mimeType: string
          url: string
          optimizedUrl?: string | null
          alt: string
        } | null
      }
      chapterIndex: Array<{
        id: string | number
        order: number
        title: string
        slug: string
        chapterSourceKey: string | null
      }>
    }
  }
}

type ChunkResponse = {
  errors?: Array<{ message?: string }>
  data: {
    bookExportChunk: {
      page: number
      totalPages: number
      chapters: Array<{
        id: string | number
        order: number
        title: string
        content: Record<string, unknown>
      }>
      media: Array<{
        id: string | number
        filename: string
        mimeType: string
        url: string
        optimizedUrl?: string | null
        alt: string
      }>
    }
  }
}

type AssetRegistryEntry = {
  id: string
  url: string
  archivePath: string
  alt: string
  mimeType: string
}

/* ------------------------------------------------------------------ */
/*  GraphQL helpers                                                    */
/* ------------------------------------------------------------------ */

const GRAPHQL_ENDPOINT = '/api/graphql'

const MANIFEST_QUERY = `
  query BookExportManifest($bookId: ID!) {
    bookExportManifest(bookId: $bookId) {
      filename
      pageSize
      totalChapters
      totalPages
      book {
        id
        title
        slug
        author
        description
        language
        publisher
        publicationDate
        isbn
        epubVersion
        updatedAt
        cover {
          id
          filename
          mimeType
          url
          optimizedUrl
          alt
        }
      }
      chapterIndex {
        id
        order
        title
        slug
        chapterSourceKey
      }
    }
  }
`

const CHUNK_QUERY = `
  query BookExportChunk($bookId: ID!, $page: Int!, $limit: Int!) {
    bookExportChunk(bookId: $bookId, page: $page, limit: $limit) {
      page
      totalPages
      chapters {
        id
        order
        title
        content
      }
      media {
        id
        filename
        mimeType
        url
        optimizedUrl
        alt
      }
    }
  }
`

const inferMimeTypeFromURL = (url: string): string | null => {
  const normalized = url.toLowerCase()

  if (normalized.includes('format=webp') || normalized.endsWith('.webp')) {
    return 'image/webp'
  }
  if (normalized.endsWith('.png')) {
    return 'image/png'
  }
  if (normalized.endsWith('.jpg') || normalized.endsWith('.jpeg')) {
    return 'image/jpeg'
  }
  if (normalized.endsWith('.gif')) {
    return 'image/gif'
  }
  if (normalized.endsWith('.svg')) {
    return 'image/svg+xml'
  }
  if (normalized.endsWith('.avif')) {
    return 'image/avif'
  }

  return null
}

const getGraphQLErrorMessage = (
  response: { errors?: Array<{ message?: string }> } | null | undefined,
  fallbackMessage: string,
): string => {
  const message = response?.errors?.find((error) => typeof error.message === 'string')?.message
  return message?.trim() ? message : fallbackMessage
}

async function fetchManifest(
  bookId: string | number,
  signal: AbortSignal,
): Promise<ManifestResponse['data']['bookExportManifest']> {
  const response = await requestJSON<ManifestResponse>(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: MANIFEST_QUERY,
      variables: { bookId: String(bookId) },
    }),
    signal,
  })

  if (!response.data?.bookExportManifest) {
    throw new Error(getGraphQLErrorMessage(response, 'Failed to fetch export manifest'))
  }

  return response.data.bookExportManifest
}

async function fetchChunk(
  bookId: string | number,
  page: number,
  limit: number,
  signal: AbortSignal,
): Promise<ChunkResponse['data']['bookExportChunk']> {
  const response = await requestJSON<ChunkResponse>(GRAPHQL_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: CHUNK_QUERY,
      variables: { bookId: String(bookId), page, limit },
    }),
    signal,
  })

  if (!response.data?.bookExportChunk) {
    throw new Error(
      getGraphQLErrorMessage(response, `Failed to fetch export chunk page ${page}`),
    )
  }

  return response.data.bookExportChunk
}

/* ------------------------------------------------------------------ */
/*  Asset download                                                     */
/* ------------------------------------------------------------------ */

async function fetchAssetBlob(url: string, signal: AbortSignal): Promise<Blob> {
  const response = await fetch(url, { signal })
  if (!response.ok) {
    throw new Error(`Asset fetch failed: ${response.status} ${response.statusText}`)
  }
  return response.blob()
}

function chooseExportMediaURL(
  media: ChunkResponse['data']['bookExportChunk']['media'][number],
): string | null {
  return media.url || media.optimizedUrl || null
}

function chooseEpubMediaType(
  media: ChunkResponse['data']['bookExportChunk']['media'][number],
): string {
  if (media.url) {
    return media.mimeType || inferMimeTypeFromURL(media.url) || 'application/octet-stream'
  }

  return inferMimeTypeFromURL(media.optimizedUrl ?? '') || media.mimeType || 'application/octet-stream'
}

/* ------------------------------------------------------------------ */
/*  Pipeline                                                           */
/* ------------------------------------------------------------------ */

export async function* runEpubExportPipeline(
  config: EpubExportPipelineConfig,
): AsyncGenerator<EpubExportEvent> {
  const { bookId, signal } = config

  try {
    /* Phase 1: Fetch manifest */
    yield { type: 'phase', phase: 'Fetching Manifest' }
    yield { type: 'status', message: 'Fetching export manifest...' }

    const manifest = await fetchManifest(bookId, signal)

    if (signal.aborted) {
      yield { type: 'phase', phase: 'Canceled' }
      return
    }

    yield { type: 'chapters-known', totalChapters: manifest.totalChapters }

    const chapterIndex: ExportChapterIndexEntry[] = manifest.chapterIndex.map((ch) => ({
      id: String(ch.id),
      order: ch.order,
      title: ch.title,
      slug: ch.slug,
      chapterSourceKey: ch.chapterSourceKey,
    }))

    const archivePathByChapterId = new Map<string, string>()
    const exportedChapters: ExportedChapterFile[] = []

    for (const ch of chapterIndex) {
      const href = createChapterArchiveName(ch.order, ch.title, ch.slug)
      archivePathByChapterId.set(ch.id, href)
      exportedChapters.push({
        id: ch.id,
        order: ch.order,
        title: ch.title,
        href: `chapters/${href}`,
      })
    }

    /* Phase 2: Iterate chunks */
    yield { type: 'phase', phase: 'Fetching Chapters' }
    yield { type: 'status', message: 'Fetching chapter content...' }

    const assetRegistry = new Map<string, AssetRegistryEntry>()
    const zip = new JSZip()
    /* mimetype must be first and uncompressed */
    zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' })
    let serializedCount = 0

    for (let page = 1; page <= manifest.totalPages; page++) {
      if (signal.aborted) {
        yield { type: 'phase', phase: 'Canceled' }
        return
      }

      const chunk = await fetchChunk(bookId, page, manifest.pageSize, signal)

      /* Accumulate media from this chunk into the global registry before serializing.
       * Upload nodes in this page depend on the matching archive path being known. */
      for (const media of chunk.media) {
        const mediaId = String(media.id)
        if (assetRegistry.has(mediaId)) continue

        const url = chooseExportMediaURL(media)
        if (!url) {
          yield { type: 'warning', message: `Media ${mediaId} has no fetchable URL` }
          continue
        }

        const mediaType = chooseEpubMediaType(media)
        const archivePath = createMediaArchiveName(mediaId, media.filename, mediaType)
        assetRegistry.set(mediaId, {
          id: mediaId,
          url,
          archivePath,
          alt: media.alt,
          mimeType: mediaType,
        })
      }

      yield { type: 'phase', phase: 'Serializing Chapters' }

      for (const ch of chunk.chapters) {
        if (signal.aborted) {
          yield { type: 'phase', phase: 'Canceled' }
          return
        }

        const chapterHref = archivePathByChapterId.get(String(ch.id))
        if (!chapterHref) {
          yield { type: 'warning', message: `Missing archive mapping for chapter ${ch.id}` }
          continue
        }

        const warnings: string[] = []

        const contentHtml = lexicalToEpubHtml(
          ch.content as unknown as import('lexical').SerializedEditorState,
          {
            resolveImage: (uploadId) => {
              const entry = assetRegistry.get(uploadId)
              if (entry) {
                return {
                  id: entry.id,
                  archivePath: entry.archivePath,
                  alt: entry.alt,
                }
              }
              return null
            },
            resolveInternalHref: (epubHref) =>
              resolveEpubHrefToArchivePath(epubHref, chapterIndex, archivePathByChapterId),
            onWarning: (msg) => warnings.push(msg),
          },
        )

        for (const w of warnings) {
          yield { type: 'warning', message: w }
        }

        const chapterDoc = buildChapterDocument({
          title: ch.title,
          content: contentHtml,
          language: manifest.book.language,
        })

        zip.file(`OEBPS/chapters/${chapterHref}`, chapterDoc)

        serializedCount += 1
        yield { type: 'chapter-serialized', completed: serializedCount, total: manifest.totalChapters }
      }
    }

    /* Phase 3: Download assets */
    yield { type: 'phase', phase: 'Downloading Assets' }
    yield { type: 'status', message: `Downloading ${assetRegistry.size} assets...` }

    const assets: ExportedAssetFile[] = []
    let downloadedCount = 0

    for (const entry of assetRegistry.values()) {
      if (signal.aborted) {
        yield { type: 'phase', phase: 'Canceled' }
        return
      }

      try {
        const blob = await fetchAssetBlob(entry.url, signal)
        zip.file(`OEBPS/images/${entry.archivePath}`, blob)

        assets.push({
          id: entry.id,
          href: `images/${entry.archivePath}`,
          mediaType: entry.mimeType,
        })

        downloadedCount += 1
        yield { type: 'asset-downloaded', completed: downloadedCount, total: assetRegistry.size }
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          throw error
        }
        yield {
          type: 'warning',
          message: `Failed to download asset ${entry.id} from ${entry.url}`,
        }
      }
    }

    /* Phase 4: Download cover if present */
    let coverAsset: ExportedAssetFile | null = null
    if (manifest.book.cover) {
      const existingCoverAsset =
        assets.find((asset) => asset.id === String(manifest.book.cover?.id)) ?? null

      if (existingCoverAsset) {
        coverAsset = existingCoverAsset
      }

      const coverUrl = manifest.book.cover.url || manifest.book.cover.optimizedUrl
      if (coverUrl) {
        if (!coverAsset) {
          try {
            const coverBlob = await fetchAssetBlob(coverUrl, signal)
            const coverMediaType =
              manifest.book.cover.url
                ? manifest.book.cover.mimeType
                : inferMimeTypeFromURL(coverUrl) || manifest.book.cover.mimeType
            const coverArchivePath = createMediaArchiveName(
              String(manifest.book.cover.id),
              manifest.book.cover.filename,
              coverMediaType,
            )
            zip.file(`OEBPS/images/${coverArchivePath}`, coverBlob)
            coverAsset = {
              id: String(manifest.book.cover.id),
              href: `images/${coverArchivePath}`,
              mediaType: coverMediaType,
            }
          } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') {
              throw error
            }
            yield {
              type: 'warning',
              message: `Failed to download cover image from ${coverUrl}`,
            }
          }
        }
      } else {
        yield {
          type: 'warning',
          message: `Cover image for book ${manifest.book.id} has no fetchable URL`,
        }
      }
    }

    /* Phase 5: Package metadata files */
    yield { type: 'phase', phase: 'Packaging' }
    yield { type: 'status', message: 'Building EPUB package...' }

    if (signal.aborted) {
      yield { type: 'phase', phase: 'Canceled' }
      return
    }

    zip.file('META-INF/container.xml', buildContainerXml())
    zip.file('OEBPS/content.opf', buildContentOpf({
      title: manifest.book.title,
      language: manifest.book.language,
      uid: String(manifest.book.id),
      chapters: exportedChapters,
      assets,
      cover: coverAsset
        ? {
            id: coverAsset.id,
            href: coverAsset.href,
            mediaType: coverAsset.mediaType,
            properties: ['cover-image'],
          }
        : null,
      author: manifest.book.author,
      description: manifest.book.description,
      publisher: manifest.book.publisher,
      publicationDate: manifest.book.publicationDate ?? undefined,
      updatedAt: manifest.book.updatedAt ?? undefined,
      isbn: manifest.book.isbn,
    }))
    zip.file('OEBPS/nav.xhtml', buildNavDocument({
      title: manifest.book.title,
      chapters: exportedChapters,
      language: manifest.book.language,
    }))
    zip.file('OEBPS/toc.ncx', buildTocNcx({
      title: manifest.book.title,
      chapters: exportedChapters,
      language: manifest.book.language,
      uid: String(manifest.book.id),
    }))
    zip.file('OEBPS/styles/book.css', buildSharedStylesheet())

    /* Phase 5: Finalize */
    yield { type: 'status', message: 'Generating EPUB file...' }

    const blob = await zip.generateAsync({ type: 'blob' }, (metadata) => {
      // Optional: could emit progress events here if needed
      void metadata
    })

    if (signal.aborted) {
      yield { type: 'phase', phase: 'Canceled' }
      return
    }

    const filename = buildExportFilename(manifest.book.slug)

    yield { type: 'done', blob, filename }
    yield { type: 'phase', phase: 'Done' }
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      yield { type: 'phase', phase: 'Canceled' }
      return
    }

    const message = error instanceof Error ? error.message : String(error)
    yield {
      type: 'warning',
      message,
    }
    yield { type: 'status', message: 'Export failed. See error details below.' }
    yield { type: 'phase', phase: 'Failed' }
  }
}
