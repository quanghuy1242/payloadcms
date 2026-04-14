'use client'

import ePub, { type Book } from 'epubjs'
import type { SpineItem } from 'epubjs/types/section'
import { useRouter } from 'next/navigation'
import React, { useRef, useState } from 'react'

import { normalizeEntityId } from '@/utils/access'
import { convertHtmlToChapterLexicalState, isSubstantiveChapterContent } from '@/utils/epubLexical'
import {
  createChapterBatches,
  buildChapterSourceKey,
  buildStableHash,
  buildStableBinaryHash,
  createImportBatchID,
  createImportedBookMediaAltText,
  createImportedBookSlug,
  createImportedBookTitle,
  createStableMediaFilename,
  deriveImageAltText,
  estimateWordCountFromHTML,
  ensureSupportedMediaBlob,
  extractChapterTitle,
  MEDIA_UPLOAD_ALLOWED_MIME_TYPES,
  resolveEpubAssetPath,
  resolveChapterTocMetadata,
  sanitizeChapterHTML,
  sleep,
} from '@/utils/epubImport'
import { requestDocumentJSONWithRetry, requestJSONWithRetry } from '@/utils/http'

type ImportPhase =
  | 'Idle'
  | 'Parsing'
  | 'Uploading Images'
  | 'Uploading Chapter'
  | 'Finalizing'
  | 'Done'
  | 'Failed'
  | 'Canceled'
  | 'Retrying'

type PayloadDocument = {
  id: number | string
  [key: string]: unknown
}

type PayloadListResponse<T extends PayloadDocument> = {
  docs: T[]
}

type MediaDocument = PayloadDocument & {
  filename?: string | null
  url?: string | null
}

type ChapterDocument = PayloadDocument

type BookDocument = PayloadDocument

type ImportProgress = {
  completedChapters: number
  currentChapter: number
  totalChapters: number
  uploadedImages: number
}

type UploadedMedia = {
  id: number | string
  url: string
}

type PreparedChapter = {
  chapterHTML: string
  chapterOrder: number
  tocHref: string | null
  tocIdRef: string | null
  tocTitle: string | null
  spineHref: string
  spineIdRef: string | null
  wordCount: number
}

const MAX_CHAPTERS_PER_BATCH = 10
const MAX_WORDS_PER_BATCH = 5000
const MAX_PARALLEL_BATCHES = 5
const MAX_CHAPTER_RETRY_ATTEMPTS = 2
const MAX_BATCH_RETRY_ATTEMPTS = 1
const PROGRESS_PATCH_INTERVAL = 5

const isAbortError = (value: unknown): boolean => {
  return value instanceof DOMException && value.name === 'AbortError'
}

const normalizeDocumentID = (value: unknown): string | number => {
  const normalized = normalizeEntityId(value)

  if (normalized != null) {
    return normalized
  }

  throw new Error('Expected a valid document identifier in the API response.')
}

export const EpubImporter: React.FC = () => {
  const router = useRouter()
  const [phase, setPhase] = useState<ImportPhase>('Idle')
  const [statusMessage, setStatusMessage] = useState('Select an EPUB file to start importing.')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [warnings, setWarnings] = useState<string[]>([])
  const [activeFileName, setActiveFileName] = useState<string | null>(null)
  const [isImporting, setIsImporting] = useState(false)
  const [progress, setProgress] = useState<ImportProgress>({
    completedChapters: 0,
    currentChapter: 0,
    totalChapters: 0,
    uploadedImages: 0,
  })

  const abortControllerRef = useRef<AbortController | null>(null)

  const appendWarnings = (newWarnings: string[]) => {
    if (newWarnings.length === 0) {
      return
    }

    setWarnings((existingWarnings) => {
      return [...existingWarnings, ...newWarnings]
    })
  }

  const ensureNotAborted = (signal: AbortSignal) => {
    if (signal.aborted) {
      throw new DOMException('Import canceled by user.', 'AbortError')
    }
  }

  const updateBookProgress = async (
    bookID: string | number,
    data: Record<string, unknown>,
    signal?: AbortSignal,
  ) => {
    await requestJSONWithRetry<BookDocument>(
      `/api/books/${bookID}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      },
      {
        retries: 1,
        signal,
        onRetry: (attempt, retries) => {
          setPhase('Retrying')
          setStatusMessage(`Retrying request (${attempt}/${retries})...`)
        },
      },
    )
  }

  const findExistingMediaByFilename = async (
    filename: string,
    signal: AbortSignal,
  ): Promise<UploadedMedia | null> => {
    const query = new URLSearchParams({
      depth: '0',
      limit: '1',
      'where[filename][equals]': filename,
    })

    const listResponse = await requestJSONWithRetry<PayloadListResponse<MediaDocument>>(
      `/api/media?${query.toString()}`,
      {
        method: 'GET',
      },
      { signal },
    )

    const existingMedia = listResponse.docs[0]

    if (!existingMedia) {
      return null
    }

    if (typeof existingMedia.url !== 'string' || existingMedia.url.length === 0) {
      return null
    }

    return {
      id: existingMedia.id,
      url: existingMedia.url,
    }
  }

  const findExistingChaptersByBook = async (
    bookID: string | number,
    signal: AbortSignal,
  ): Promise<ChapterDocument[]> => {
    const query = new URLSearchParams({
      depth: '0',
      limit: '1000',
      'where[book][equals]': String(bookID),
      sort: 'order',
    })

    const listResponse = await requestJSONWithRetry<PayloadListResponse<ChapterDocument>>(
      `/api/chapters?${query.toString()}`,
      {
        method: 'GET',
      },
      { signal },
    )

    return listResponse.docs
  }

  const findExistingBooksBySourceHashes = async (
    sourceHashes: string[],
    signal: AbortSignal,
  ): Promise<BookDocument[]> => {
    const uniqueSourceHashes = Array.from(new Set(sourceHashes.filter((value) => value.length > 0)))
    const query = new URLSearchParams({
      depth: '0',
      limit: '10',
      sort: '-updatedAt',
      'where[origin][equals]': 'epub-imported',
    })

    if (uniqueSourceHashes.length === 1) {
      query.set('where[sourceHash][equals]', uniqueSourceHashes[0])
    } else {
      uniqueSourceHashes.forEach((sourceHash, index) => {
        query.set(`where[or][${index}][sourceHash][equals]`, sourceHash)
      })
    }

    const listResponse = await requestJSONWithRetry<PayloadListResponse<BookDocument>>(
      `/api/books?${query.toString()}`,
      {
        method: 'GET',
      },
      { signal },
    )

    return listResponse.docs
  }

  const readArchiveBlob = async (book: Book, assetPath: string): Promise<Blob> => {
    const candidatePaths = new Set<string>()

    const addCandidate = (candidate: string) => {
      if (!candidate) {
        return
      }

      const normalizedCandidate = candidate.replace(/^\/+/, '')
      candidatePaths.add(normalizedCandidate)

      if (!/^(https?:\/\/|data:|blob:|\/\/)/i.test(normalizedCandidate)) {
        candidatePaths.add(`/${normalizedCandidate}`)
      }
    }

    try {
      addCandidate(assetPath)
      addCandidate(decodeURIComponent(assetPath))
    } catch {
      addCandidate(assetPath)
    }

    const resolvedArchivePath = book.resolve(assetPath, false)
    if (resolvedArchivePath) {
      addCandidate(resolvedArchivePath)
    }

    for (const candidatePath of candidatePaths) {
      try {
        const candidateBlob = await book.archive.getBlob(candidatePath)

        if (candidateBlob instanceof Blob) {
          return candidateBlob
        }
      } catch {
        // fallback below
      }
    }

    for (const candidatePath of candidatePaths) {
      try {
        const objectURL = await book.archive.createUrl(candidatePath, { base64: false })

        try {
          const response = await fetch(objectURL)

          if (!response.ok) {
            continue
          }

          return await response.blob()
        } finally {
          book.archive.revokeUrl(objectURL)
        }
      } catch {
        // continue trying
      }
    }

    throw new Error(`Failed to load image asset from EPUB archive: ${assetPath}`)
  }

  const uploadAssetAsMedia = async (
    book: Book,
    resolvedAssetPath: string,
    mediaAltText: string,
    imageIndex: number,
    filenameScope: string,
    mediaCache: Map<string, UploadedMedia>,
    mediaInFlight: Map<string, Promise<UploadedMedia | null>>,
    signal: AbortSignal,
  ): Promise<UploadedMedia | null> => {
    const cached = mediaCache.get(resolvedAssetPath)

    if (cached) {
      return cached
    }

    const inFlight = mediaInFlight.get(resolvedAssetPath)

    if (inFlight) {
      return await inFlight
    }

    const uploadPromise = (async (): Promise<UploadedMedia | null> => {
      const rawBlob = await readArchiveBlob(book, resolvedAssetPath)
      const normalizedBlob = await ensureSupportedMediaBlob(rawBlob)

      if (!normalizedBlob) {
        appendWarnings([
          `Skipped unsupported image format for asset \"${resolvedAssetPath}\". Allowed MIME types: ${Array.from(MEDIA_UPLOAD_ALLOWED_MIME_TYPES).join(', ')}.`,
        ])
        return null
      }

      const stableFilename = createStableMediaFilename(
        resolvedAssetPath,
        normalizedBlob.mimeType,
        imageIndex + 1,
        filenameScope,
      )

      const existingMedia = await findExistingMediaByFilename(stableFilename, signal)

      if (existingMedia) {
        mediaCache.set(resolvedAssetPath, existingMedia)
        return existingMedia
      }

      const mediaFormData = new FormData()
      mediaFormData.append('file', normalizedBlob.blob, stableFilename)
      mediaFormData.append('alt', mediaAltText)
      mediaFormData.append('_payload', JSON.stringify({ alt: mediaAltText }))

      const mediaResponse = await requestDocumentJSONWithRetry<MediaDocument>(
        '/api/media',
        {
          method: 'POST',
          body: mediaFormData,
        },
        {
          signal,
        },
      )

      if (typeof mediaResponse.url !== 'string' || mediaResponse.url.length === 0) {
        throw new Error(`Media upload succeeded without a URL for asset ${resolvedAssetPath}.`)
      }

      const uploadedMedia: UploadedMedia = {
        id: mediaResponse.id,
        url: mediaResponse.url,
      }

      mediaCache.set(resolvedAssetPath, uploadedMedia)
      setProgress((existingProgress) => {
        return {
          ...existingProgress,
          uploadedImages: existingProgress.uploadedImages + 1,
        }
      })

      return uploadedMedia
    })()

    mediaInFlight.set(resolvedAssetPath, uploadPromise)

    try {
      return await uploadPromise
    } finally {
      mediaInFlight.delete(resolvedAssetPath)
    }
  }

  const upsertChapterDocument = async (
    chapterData: Record<string, unknown>,
    chapterOrder: number,
    existingChaptersByOrder: Map<number, ChapterDocument>,
    signal: AbortSignal,
  ) => {
    const existingChapter = existingChaptersByOrder.get(chapterOrder) ?? null

    if (!existingChapter) {
      const createdChapter = await requestDocumentJSONWithRetry<ChapterDocument>(
        '/api/chapters',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(chapterData),
        },
        {
          signal,
        },
      )

      existingChaptersByOrder.set(chapterOrder, createdChapter)

      return
    }

    const existingChapterID = normalizeDocumentID(existingChapter.id)

    const updatedChapter = await requestDocumentJSONWithRetry<ChapterDocument>(
      `/api/chapters/${existingChapterID}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(chapterData),
      },
      {
        signal,
      },
    )

    existingChaptersByOrder.set(chapterOrder, updatedChapter)
  }

  const patchBookFailureState = async (bookID: string | number, reason: string) => {
    try {
      await updateBookProgress(bookID, {
        importStatus: 'failed',
        importErrorSummary: reason,
      })
    } catch {
      // Do not mask the original importer error if the fallback patch fails.
    }
  }

  const patchBookReadyState = async (
    bookID: string | number,
    completedChapters: number,
    skippedChapters: number,
  ) => {
    await updateBookProgress(bookID, {
      importErrorSummary:
        skippedChapters > 0
          ? `${skippedChapters} chapter${skippedChapters === 1 ? '' : 's'} were skipped during import.`
          : null,
      importFailedAt: null,
      importFinishedAt: new Date().toISOString(),
      importStatus: 'ready',
      importCompletedChapters: completedChapters,
      lastImportedAt: new Date().toISOString(),
      syncStatus: skippedChapters > 0 ? 'pending' : 'clean',
    })
  }

  const prepareChaptersForImport = async (
    book: Book,
    spineItems: SpineItem[],
    signal: AbortSignal,
  ): Promise<PreparedChapter[]> => {
    const preparedChapters: PreparedChapter[] = []
    const tocItems = await book.loaded.navigation
      .then((navigation) => {
        return navigation.toc ?? []
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : 'Unknown table of contents failure.'
        appendWarnings([`Unable to load EPUB table of contents: ${message}`])
        return []
      })

    for (let chapterIndex = 0; chapterIndex < spineItems.length; chapterIndex += 1) {
      ensureNotAborted(signal)

      const spineItem = spineItems[chapterIndex]
      const chapterOrder = chapterIndex + 1
      const section = book.section(spineItem.index)

      setPhase('Parsing')
      setStatusMessage(`Analyzing chapter ${chapterOrder} of ${spineItems.length}...`)

      try {
        await Promise.resolve(section.load(book.load.bind(book)))
        // Skip render() — it rewrites img src to blob: URLs which breaks Phase 2 image resolution.
        // section.document has the raw HTML with original relative paths after load().
        const chapterHTML = section.document?.documentElement?.outerHTML ?? ''

        if (!chapterHTML) {
          appendWarnings([`Skipped chapter ${chapterOrder}: Unable to render chapter content.`])
          continue
        }

        const tocMetadata = resolveChapterTocMetadata(tocItems, spineItem.href ?? '')

        preparedChapters.push({
          chapterHTML,
          chapterOrder,
          tocHref: tocMetadata?.href ?? null,
          tocIdRef: tocMetadata?.id ?? null,
          tocTitle: tocMetadata?.title ?? null,
          spineHref: spineItem.href ?? '',
          spineIdRef: (spineItem as unknown as { idref?: string }).idref ?? null,
          wordCount: estimateWordCountFromHTML(chapterHTML),
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unexpected chapter preflight failure.'
        appendWarnings([`Skipped chapter ${chapterOrder}: ${message}`])
      } finally {
        section.unload()
      }
    }

    return preparedChapters
  }

  const processPreparedChapter = async (
    book: Book,
    bookID: string | number,
    importBatchID: string,
    importedTitle: string,
    sourceHash: string,
    preparedChapter: PreparedChapter,
    totalChapters: number,
    existingChaptersByOrder: Map<number, ChapterDocument>,
    mediaCache: Map<string, UploadedMedia>,
    mediaInFlight: Map<string, Promise<UploadedMedia | null>>,
    signal: AbortSignal,
  ): Promise<boolean> => {
    ensureNotAborted(signal)

    const chapterOrder = preparedChapter.chapterOrder

    setProgress((existingProgress) => {
      return {
        ...existingProgress,
        currentChapter: Math.max(existingProgress.currentChapter, chapterOrder),
        totalChapters,
      }
    })

    setPhase('Uploading Chapter')
    setStatusMessage(`Processing chapter ${chapterOrder} of ${totalChapters}...`)

      try {
        const parser = new DOMParser()
        const chapterDocument = parser.parseFromString(preparedChapter.chapterHTML, 'text/html')
        const rawSanitizedChapter = sanitizeChapterHTML(preparedChapter.chapterHTML)
        const chapterTitle =
          preparedChapter.tocTitle ??
          extractChapterTitle(preparedChapter.chapterHTML, `Chapter ${chapterOrder}`, chapterOrder)
        const chapterImages = Array.from(
          chapterDocument.querySelectorAll('img[src], image[href], image[xlink\\:href]'),
        )

      for (let imageIndex = 0; imageIndex < chapterImages.length; imageIndex += 1) {
        ensureNotAborted(signal)

        setPhase('Uploading Images')
        setStatusMessage(
          `Uploading image ${imageIndex + 1} of ${chapterImages.length} in chapter ${chapterOrder}...`,
        )

        const imageElement = chapterImages[imageIndex]
        const imageSource =
          imageElement.getAttribute('src') ??
          imageElement.getAttribute('href') ??
          imageElement.getAttribute('xlink:href')

        if (!imageSource) {
          continue
        }

        const resolvedAssetPath = resolveEpubAssetPath(preparedChapter.spineHref, imageSource)

        if (!resolvedAssetPath) {
          appendWarnings([
            `Skipped unresolved image source \"${imageSource}\" in chapter ${chapterOrder}.`,
          ])
          continue
        }

        let uploadedMedia: UploadedMedia | null = null
        const mediaAltText = createImportedBookMediaAltText(
          importedTitle,
          sourceHash,
          imageIndex + 1,
          deriveImageAltText(imageElement, chapterTitle, imageIndex),
        )

        try {
          uploadedMedia = await uploadAssetAsMedia(
            book,
            resolvedAssetPath,
            mediaAltText,
            imageIndex,
            sourceHash,
            mediaCache,
            mediaInFlight,
            signal,
          )
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unexpected image upload failure.'
          appendWarnings([
            `Skipped image ${imageIndex + 1} in chapter ${chapterOrder}: ${message}`,
          ])
          continue
        }

        if (!uploadedMedia) {
          continue
        }

        imageElement.setAttribute('data-lexical-upload-id', String(uploadedMedia.id))
        imageElement.setAttribute('data-lexical-upload-relation-to', 'media')

        if (imageElement.tagName.toLowerCase() === 'image') {
          imageElement.setAttribute('href', uploadedMedia.url)
          imageElement.setAttribute('xlink:href', uploadedMedia.url)
        } else {
          imageElement.setAttribute('src', uploadedMedia.url)
          imageElement.removeAttribute('srcset')
        }

        if (imageElement.tagName.toLowerCase() === 'image') {
          imageElement.setAttribute('aria-label', mediaAltText)
          imageElement.setAttribute('title', mediaAltText)
        } else {
          imageElement.setAttribute('alt', mediaAltText)
        }
      }

      setPhase('Uploading Chapter')
      setStatusMessage(`Converting chapter ${chapterOrder} content to Lexical...`)

      const chapterHTMLWithUploadedImages = chapterDocument.documentElement.outerHTML
      const sanitizedChapter = sanitizeChapterHTML(chapterHTMLWithUploadedImages)
      const chapterSourceHash = buildStableHash(rawSanitizedChapter.html)
      const chapterSourceKey = buildChapterSourceKey(
        preparedChapter.tocHref ?? preparedChapter.spineHref,
        preparedChapter.tocIdRef ?? preparedChapter.spineIdRef,
        chapterOrder,
      )

      appendWarnings(
        sanitizedChapter.warnings.map((warning) => {
          return `Chapter ${chapterOrder}: ${warning}`
        }),
      )

      const lexicalContent = convertHtmlToChapterLexicalState(sanitizedChapter.html)

      // Skip navigation-only or empty chapters instead of sending them to the API
      if (!isSubstantiveChapterContent(lexicalContent)) {
        appendWarnings([`Skipped chapter ${chapterOrder}: navigation-only or empty content.`])
        return false
      }

      const chapterSlugBase = createImportedBookSlug(chapterTitle)
      const chapterSlug = chapterSlugBase
        ? `${chapterSlugBase}-${chapterOrder}`
        : `chapter-${chapterOrder}`

      await upsertChapterDocument(
        {
          _status: 'draft',
          book: bookID,
          chapterSourceHash,
          chapterSourceKey,
          content: lexicalContent,
          importBatchId: importBatchID,
          manualEditedAt: null,
          order: chapterOrder,
          slug: chapterSlug,
          title: chapterTitle,
        },
        chapterOrder,
        existingChaptersByOrder,
        signal,
      )

      setProgress((existingProgress) => {
        return {
          ...existingProgress,
          completedChapters: Math.min(totalChapters, existingProgress.completedChapters + 1),
        }
      })

      return true
    } catch (error) {
      if (isAbortError(error) || signal.aborted) {
        throw error
      }

      const message = error instanceof Error ? error.message : 'Unexpected chapter import failure.'
      appendWarnings([`Skipped chapter ${chapterOrder}: ${message}`])
      return false
    }
  }

  const processPreparedChapterWithRetry = async (
    book: Book,
    bookID: string | number,
    importBatchID: string,
    importedTitle: string,
    sourceHash: string,
    preparedChapter: PreparedChapter,
    totalChapters: number,
    existingChaptersByOrder: Map<number, ChapterDocument>,
    mediaCache: Map<string, UploadedMedia>,
    mediaInFlight: Map<string, Promise<UploadedMedia | null>>,
    signal: AbortSignal,
  ): Promise<boolean> => {
    for (let attempt = 0; attempt <= MAX_CHAPTER_RETRY_ATTEMPTS; attempt += 1) {
      const success = await processPreparedChapter(
        book,
        bookID,
        importBatchID,
        importedTitle,
        sourceHash,
        preparedChapter,
        totalChapters,
        existingChaptersByOrder,
        mediaCache,
        mediaInFlight,
        signal,
      )

      if (success) {
        return true
      }

      if (attempt < MAX_CHAPTER_RETRY_ATTEMPTS) {
        setPhase('Retrying')
        setStatusMessage(
          `Retrying chapter ${preparedChapter.chapterOrder} (${attempt + 1}/${MAX_CHAPTER_RETRY_ATTEMPTS})...`,
        )
        await sleep(150 * (attempt + 1))
      }
    }

    return false
  }

  const processBatchWithRetry = async (
    batch: PreparedChapter[],
    batchIndex: number,
    totalBatches: number,
    book: Book,
    bookID: string | number,
    importBatchID: string,
    importedTitle: string,
    sourceHash: string,
    totalChapters: number,
    existingChaptersByOrder: Map<number, ChapterDocument>,
    mediaCache: Map<string, UploadedMedia>,
    mediaInFlight: Map<string, Promise<UploadedMedia | null>>,
    signal: AbortSignal,
  ): Promise<{ completedChapters: number; skippedChapters: number }> => {
    for (let attempt = 0; attempt <= MAX_BATCH_RETRY_ATTEMPTS; attempt += 1) {
      try {
        setPhase('Uploading Chapter')
        setStatusMessage(`Processing batch ${batchIndex + 1} of ${totalBatches}...`)

        let completedChapters = 0
        let skippedChapters = 0

        for (const preparedChapter of batch) {
          ensureNotAborted(signal)

          const chapterSucceeded = await processPreparedChapterWithRetry(
            book,
            bookID,
            importBatchID,
            importedTitle,
            sourceHash,
            preparedChapter,
            totalChapters,
            existingChaptersByOrder,
            mediaCache,
            mediaInFlight,
            signal,
          )

          if (chapterSucceeded) {
            completedChapters += 1
          } else {
            skippedChapters += 1
          }
        }

        return {
          completedChapters,
          skippedChapters,
        }
      } catch (error) {
        if (isAbortError(error) || signal.aborted) {
          throw error
        }

        if (attempt < MAX_BATCH_RETRY_ATTEMPTS) {
          setPhase('Retrying')
          setStatusMessage(`Retrying batch ${batchIndex + 1} (${attempt + 1}/${MAX_BATCH_RETRY_ATTEMPTS})...`)
          await sleep(250 * (attempt + 1))
          continue
        }

        const message = error instanceof Error ? error.message : 'Unexpected batch import failure.'
        appendWarnings([`Skipped batch ${batchIndex + 1}: ${message}`])

        return {
          completedChapters: 0,
          skippedChapters: batch.length,
        }
      }
    }

    return {
      completedChapters: 0,
      skippedChapters: batch.length,
    }
  }

  const runWithConcurrency = async <T, R>(
    items: T[],
    maxConcurrency: number,
    worker: (item: T, index: number) => Promise<R>,
  ): Promise<R[]> => {
    if (items.length === 0) {
      return []
    }

    const results: R[] = new Array(items.length)
    const concurrency = Math.max(1, Math.min(maxConcurrency, items.length))
    let nextIndex = 0

    const runWorker = async () => {
      while (nextIndex < items.length) {
        const currentIndex = nextIndex
        nextIndex += 1
        results[currentIndex] = await worker(items[currentIndex], currentIndex)
      }
    }

    await Promise.all(Array.from({ length: concurrency }, () => runWorker()))

    return results
  }

  const processBookCover = async (
    book: Book,
    bookID: string | number,
    title: string,
    sourceHash: string,
    mediaCache: Map<string, UploadedMedia>,
    mediaInFlight: Map<string, Promise<UploadedMedia | null>>,
    signal: AbortSignal,
  ) => {
    ensureNotAborted(signal)

    let coverPath = ''

    const packaging = (book as any).packaging
    const manifest = packaging?.manifest ?? {}
    const metadata = packaging?.metadata ?? {}

    // EPUB 3: manifest item with properties="cover-image"
    let coverManifestItem = Object.values(manifest).find(
      (item: any) => item?.properties?.includes('cover-image'),
    ) as any

    // EPUB 2: <meta name="cover" content="cover-id"/>
    if (!coverManifestItem) {
      const coverMetaId = metadata?.cover
      if (coverMetaId && manifest[coverMetaId]) {
        coverManifestItem = manifest[coverMetaId]
      }
    }

    if (!coverManifestItem) {
      const loadedCoverPath = await book.loaded.cover.catch(() => null)
      if (loadedCoverPath && !loadedCoverPath.startsWith('blob:')) {
        coverPath = loadedCoverPath
      } else {
        appendWarnings([`Cover upload skipped: no cover image found in EPUB manifest.`])
        return
      }
    } else {
      coverPath = coverManifestItem.href ?? ''
    }

    if (!coverPath) {
      return
    }

    try {
      const coverAltText = createImportedBookMediaAltText(
        title,
        sourceHash,
        'cover',
        `Cover image for ${title}`,
      )

      const uploadedMedia = await uploadAssetAsMedia(
        book,
        coverPath,
        coverAltText,
        0,
        sourceHash,
        mediaCache,
        mediaInFlight,
        signal,
      )

      if (!uploadedMedia) {
        return
      }

      try {
        await updateBookProgress(
          bookID,
          {
            cover: uploadedMedia.id,
          },
          signal,
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unexpected cover update failure.'
        appendWarnings([
          `Cover image uploaded for ${title}, but the book record could not be updated with the cover reference: ${message}`,
        ])
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected cover upload failure.'
      appendWarnings([
        `Cover upload failed for ${title}. The import will continue without a cover image. ${message}`,
      ])
    }
  }

  const resetUIStateForImport = (fileName: string) => {
    setActiveFileName(fileName)
    setWarnings([])
    setErrorMessage(null)
    setProgress({
      completedChapters: 0,
      currentChapter: 0,
      totalChapters: 0,
      uploadedImages: 0,
    })
  }

  const startImport = async (file: File) => {
    if (isImporting) {
      return
    }

    setIsImporting(true)
    setPhase('Parsing')
    setStatusMessage('Opening EPUB and reading metadata...')
    resetUIStateForImport(file.name)

    const abortController = new AbortController()
    abortControllerRef.current = abortController

    let openedBook: Book | null = null
    let createdBookID: string | number | null = null
    let shouldRefreshBooks = false

    try {
      const epubData = await file.arrayBuffer()
      openedBook = ePub()

      await openedBook.open(epubData, 'binary')
      await openedBook.ready
      ensureNotAborted(abortController.signal)

      const metadata = await openedBook.loaded.metadata
      const spine = (await openedBook.loaded.spine) as unknown as {
        spineItems: SpineItem[]
      }
      const spineItems = spine.spineItems.filter((spineItem) => spineItem.linear !== 'no')

      if (spineItems.length === 0) {
        throw new Error('No readable chapters were found in the EPUB spine.')
      }

      const importBatchID = createImportBatchID()
      const importedTitle = createImportedBookTitle(metadata.title, file.name)
      const importedAuthor =
        typeof metadata.creator === 'string' && metadata.creator.trim().length > 0
          ? metadata.creator.trim()
          : null
      const sourceHash = buildStableBinaryHash(epubData)
      const legacySourceHash = buildStableHash(`${file.name}:${file.size}:${file.lastModified}`)

      const existingBooks = await findExistingBooksBySourceHashes(
        [sourceHash, legacySourceHash],
        abortController.signal,
      )
      const reusableBook = existingBooks[0] ?? null
      const duplicateBooks = existingBooks.slice(1)

      if (duplicateBooks.length > 0) {
        appendWarnings([
          `Found ${duplicateBooks.length} older duplicate book record${duplicateBooks.length === 1 ? '' : 's'} for this EPUB. The importer will reuse the newest record and mark older duplicates as failed.`,
        ])
      }

      if (reusableBook) {
        createdBookID = normalizeDocumentID(reusableBook.id)
        setStatusMessage('Reusing existing book record...')

        await updateBookProgress(
          createdBookID,
          {
            author: importedAuthor,
            importBatchId: importBatchID,
            importCompletedChapters: 0,
            importErrorSummary: null,
            importFailedAt: null,
            importFinishedAt: null,
            importStartedAt: new Date().toISOString(),
            importStatus: 'importing',
            importTotalChapters: spineItems.length,
            origin: 'epub-imported',
            sourceHash,
            sourceType: 'epub-upload',
            syncStatus: 'pending',
            title: importedTitle,
          },
          abortController.signal,
        )
      } else {
        setStatusMessage('Creating book record...')

        const createdBook = await requestDocumentJSONWithRetry<BookDocument>(
          '/api/books',
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              author: importedAuthor,
              importBatchId: importBatchID,
              importCompletedChapters: 0,
              importStartedAt: new Date().toISOString(),
              importStatus: 'importing',
              importTotalChapters: spineItems.length,
              origin: 'epub-imported',
              sourceHash,
              sourceType: 'epub-upload',
              syncStatus: 'pending',
              title: importedTitle,
            }),
          },
          {
            signal: abortController.signal,
            onRetry: (attempt, retries) => {
              setPhase('Retrying')
              setStatusMessage(`Retrying request (${attempt}/${retries})...`)
            },
          },
        )

        createdBookID = normalizeDocumentID(createdBook.id)
      }

      for (const duplicateBook of duplicateBooks) {
        const duplicateBookID = normalizeDocumentID(duplicateBook.id)

        await updateBookProgress(
          duplicateBookID,
          {
            importErrorSummary: 'Superseded by a later import of the same EPUB.',
            importStatus: 'failed',
            syncStatus: 'conflicted',
          },
          abortController.signal,
        )
      }

      const mediaCache = new Map<string, UploadedMedia>()
      const mediaInFlight = new Map<string, Promise<UploadedMedia | null>>()
      let completedChapters = 0

      if (createdBookID == null) {
        throw new Error('Book record was not created before chapter import started.')
      }

      if (!openedBook) {
        throw new Error('EPUB book context was not available for chapter import.')
      }

      const importBookID: string | number = createdBookID
      const importBook: Book = openedBook

      const existingChapters = await findExistingChaptersByBook(importBookID, abortController.signal)
      const existingChaptersByOrder = new Map<number, ChapterDocument>()

      for (const existingChapter of existingChapters) {
        const chapterOrderValue = (existingChapter as { order?: unknown }).order

        if (typeof chapterOrderValue === 'number' && Number.isFinite(chapterOrderValue)) {
          existingChaptersByOrder.set(chapterOrderValue, existingChapter)
        }
      }

      const preparedChapters = await prepareChaptersForImport(openedBook, spineItems, abortController.signal)
      const chapterBatches = createChapterBatches(
        preparedChapters,
        MAX_CHAPTERS_PER_BATCH,
        MAX_WORDS_PER_BATCH,
      )
      const preflightSkippedChapters = Math.max(0, spineItems.length - preparedChapters.length)
      let skippedChapters = preflightSkippedChapters

      if (preparedChapters.length === 0) {
        throw new Error('No chapters could be prepared for import.')
      }

      setProgress((existingProgress) => {
        return {
          ...existingProgress,
          currentChapter: 0,
          totalChapters: spineItems.length,
        }
      })

      await processBookCover(
        importBook,
        importBookID,
        importedTitle,
        sourceHash,
        mediaCache,
        mediaInFlight,
        abortController.signal,
      )

      const batchResults = await runWithConcurrency(
        chapterBatches,
        MAX_PARALLEL_BATCHES,
        async (batch, batchIndex) => {
          return await processBatchWithRetry(
            batch,
            batchIndex,
            chapterBatches.length,
            importBook,
            importBookID,
            importBatchID,
            importedTitle,
            sourceHash,
            preparedChapters.length,
            existingChaptersByOrder,
            mediaCache,
            mediaInFlight,
            abortController.signal,
          )
        },
      )

      for (const batchResult of batchResults) {
        completedChapters += batchResult.completedChapters
        skippedChapters += batchResult.skippedChapters
      }

      for (let index = 0; index < batchResults.length; index += 1) {
        const runningCompleted = batchResults
          .slice(0, index + 1)
          .reduce((sum, result) => sum + result.completedChapters, 0)

        if ((index + 1) % PROGRESS_PATCH_INTERVAL === 0 || index === batchResults.length - 1) {
          await updateBookProgress(
            importBookID,
            {
              importCompletedChapters: runningCompleted,
            },
            abortController.signal,
          )
        }
      }

      setPhase('Finalizing')
      setStatusMessage('Finalizing import status...')

      await patchBookReadyState(importBookID, completedChapters, skippedChapters)

      setPhase('Done')
      setStatusMessage(
        skippedChapters > 0
          ? `Import completed with ${skippedChapters} skipped chapter${skippedChapters === 1 ? '' : 's'}.`
          : `Import completed. ${completedChapters} chapter${completedChapters === 1 ? '' : 's'} created.`,
      )
      shouldRefreshBooks = true
    } catch (error) {
      if (isAbortError(error) || abortController.signal.aborted) {
        setPhase('Canceled')
        setStatusMessage('Import canceled. Any chapters already written were kept as draft.')

        if (createdBookID) {
          await patchBookFailureState(createdBookID, 'Import canceled by user.')
        }
      } else {
        const message = error instanceof Error ? error.message : 'Unknown EPUB import failure.'
        setPhase('Failed')
        setErrorMessage(message)
        setStatusMessage('Import failed. See error details below.')

        if (createdBookID) {
          await patchBookFailureState(createdBookID, message)
        }
      }
    } finally {
      abortControllerRef.current = null
      openedBook?.destroy()
      if (shouldRefreshBooks) {
        router.refresh()
      }
      setIsImporting(false)
    }
  }

  const cancelImport = () => {
    abortControllerRef.current?.abort()
  }

  return (
    <div className="epub-importer">
      <div className="epub-importer__header">
        <h3>EPUB Importer</h3>
        <p>Client-side import pipeline for EPUB parsing, image upload, and chapter creation.</p>
      </div>

      <div className="epub-importer__controls">
        <label htmlFor="epub-import-input" className="epub-importer__input-label">
          Select EPUB file
        </label>
        <input
          id="epub-import-input"
          type="file"
          accept=".epub,application/epub+zip"
          disabled={isImporting}
          onChange={(event) => {
            const selectedFile = event.target.files?.[0]

            if (selectedFile) {
              void startImport(selectedFile)
            }

            event.target.value = ''
          }}
        />

        <button
          type="button"
          className="epub-importer__cancel-button"
          disabled={!isImporting}
          onClick={cancelImport}
        >
          Cancel Import
        </button>
      </div>

      <div className="epub-importer__status">
        <p>
          <strong>Phase:</strong> {phase}
        </p>
        <p>{statusMessage}</p>
        {activeFileName && (
          <p>
            <strong>File:</strong> {activeFileName}
          </p>
        )}
        {(progress.totalChapters > 0 || progress.uploadedImages > 0) && (
          <div className="epub-importer__progress">
            <p>
              <strong>Chapters:</strong> {progress.completedChapters}/{progress.totalChapters}
            </p>
            <p>
              <strong>Images Uploaded:</strong> {progress.uploadedImages}
            </p>
          </div>
        )}
      </div>

      {errorMessage && (
        <div className="epub-importer__error">
          <strong>Error:</strong> {errorMessage}
        </div>
      )}

      {warnings.length > 0 && (
        <details className="epub-importer__warnings">
          <summary>Warnings ({warnings.length})</summary>
          <ul>
            {warnings.map((warning, index) => {
              return <li key={`${warning}-${index}`}>{warning}</li>
            })}
          </ul>
        </details>
      )}

      <style jsx>{`
        .epub-importer {
          border: 1px solid var(--theme-elevation-200);
          border-radius: 12px;
          padding: 1.5rem;
          margin: 1rem 1rem 1.5rem;
          background: var(--theme-elevation-50);
          display: grid;
          gap: 1rem;
          box-sizing: border-box;
        }

        .epub-importer__header h3 {
          margin: 0;
          font-size: 1rem;
        }

        .epub-importer__header p {
          margin: 0.25rem 0 0;
          font-size: 0.875rem;
          color: var(--theme-elevation-700);
        }

        .epub-importer__controls {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.6rem;
        }

        .epub-importer__input-label {
          font-size: 0.875rem;
          font-weight: 600;
        }

        .epub-importer__cancel-button {
          border: 1px solid var(--theme-error-400);
          background: var(--theme-error-100);
          color: var(--theme-error-900);
          padding: 0.45rem 0.75rem;
          border-radius: 4px;
          cursor: pointer;
          font-size: 0.85rem;
        }

        .epub-importer__cancel-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .epub-importer__status p {
          margin: 0.1rem 0;
          font-size: 0.9rem;
        }

        .epub-importer__progress {
          margin-top: 0.35rem;
          padding: 0.5rem;
          border: 1px dashed var(--theme-elevation-250);
          border-radius: 4px;
        }

        .epub-importer__error {
          border: 1px solid var(--theme-error-400);
          background: var(--theme-error-100);
          color: var(--theme-error-900);
          border-radius: 4px;
          padding: 0.65rem;
          font-size: 0.9rem;
        }

        .epub-importer__warnings {
          border: 1px solid var(--theme-warning-300);
          background: var(--theme-warning-100);
          color: var(--theme-warning-900);
          border-radius: 4px;
          padding: 0.65rem;
        }

        .epub-importer__warnings ul {
          margin: 0.5rem 0 0;
          padding-left: 1.2rem;
        }

        .epub-importer__warnings li {
          margin-bottom: 0.25rem;
          font-size: 0.85rem;
        }
      `}</style>
    </div>
  )
}

export default EpubImporter
