// BROWSER-ONLY MODULE
// This module orchestrates the EPUB import pipeline using browser APIs (epubjs, DOMParser,
// Blob, FormData, fetch). It must not be imported in server-side or Node.js contexts.
// For runtime-agnostic HTML → Lexical conversion, use epubLexical.ts instead.

import type { Book } from 'epubjs'
import type { SpineItem } from 'epubjs/types/section'

import {
  collectFootnoteDefinitionsFromHTML,
  convertHtmlToChapterLexicalState,
  isSubstantiveChapterContent,
  type FootnoteDefinition,
} from './epubLexical'
import {
  buildChapterSourceKey,
  buildStableBinaryHash,
  buildStableHash,
  createChapterBatches,
  createImportBatchID,
  createImportedBookMediaAltText,
  createImportedBookSlug,
  createImportedBookTitle,
  createStableMediaFilename,
  deriveImageAltText,
  ensureSupportedMediaBlob,
  estimateWordCountFromHTML,
  extractChapterTitle,
  MEDIA_UPLOAD_ALLOWED_MIME_TYPES,
  resolveChapterTocMetadata,
  resolveEpubAssetPath,
  sanitizeChapterHTML,
  sleep,
} from './epubImport'
import type { EpubFailureLog } from './epubFailureLog'
import { normalizeEntityId } from './identifiers'
import { requestDocumentJSONWithRetry, requestJSONWithRetry } from './http'
import { toNullableString } from './strings'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export type ImportPhase =
  | 'Idle'
  | 'Parsing'
  | 'Uploading Images'
  | 'Uploading Chapter'
  | 'Finalizing'
  | 'Done'
  | 'Failed'
  | 'Canceled'
  | 'Retrying'

export type ImportProgress = {
  completedChapters: number
  currentChapter: number
  totalChapters: number
  uploadedImages: number
}

export type EpubPipelineEvent =
  | { type: 'phase'; phase: ImportPhase }
  | { type: 'status'; message: string }
  | { type: 'image-uploaded' }
  | { type: 'chapter-started'; chapterOrder: number; totalChapters: number }
  | { type: 'chapter-completed' }
  // Emitted when a chapter is skipped because it already exists with the same
  // importBatchId + chapterSourceKey (T3-4 resumption checkpointing).
  | { type: 'chapter-checkpointed'; chapterOrder: number }
  | { type: 'totals-known'; totalChapters: number }
  | { type: 'warning'; message: string }
  | { type: 'book-created'; bookId: string | number }
  | { type: 'done'; completedChapters: number; skippedChapters: number }

export type EpubPipelineConfig = {
  file: File
  signal: AbortSignal
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

type Emit = (event: EpubPipelineEvent) => void

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

type ChapterDocument = PayloadDocument & {
  chapterSourceKey?: string | null
  importBatchId?: string | null
  manualEditedAt?: string | null
  chapterWordCount?: number | null
  order?: number | null
}

type BookDocument = PayloadDocument

type UploadedMedia = {
  id: number | string
  url: string
}

type PreparedChapter = {
  chapterTitle: string
  chapterHTML: string
  chapterOrder: number
  footnoteDefinitions: FootnoteDefinition[]
  tocHref: string | null
  tocIdRef: string | null
  tocTitle: string | null
  spineHref: string
  spineIdRef: string | null
  wordCount: number
}

type ChapterProcessResult = {
  success: boolean
  checkpointed?: boolean
  failureReason?: string
}

type BatchResult = {
  completedChapters: number
  failureLogs: EpubFailureLog
  skippedChapters: number
}

const MAX_CHAPTERS_PER_BATCH = 10
const MAX_WORDS_PER_BATCH = 5000
const MAX_CHAPTER_RETRY_ATTEMPTS = 2
const MAX_BATCH_RETRY_ATTEMPTS = 1
const PROGRESS_PATCH_INTERVAL = 5

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

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

const normalizeEpubLanguage = (value: unknown): string => {
  const normalized = toNullableString(value)

  if (!normalized) {
    return 'en'
  }

  const normalizedTag = normalized.replace(/_/g, '-')

  try {
    return Intl.getCanonicalLocales(normalizedTag)[0] ?? normalizedTag
  } catch {
    return normalizedTag
  }
}

const normalizeEpubSubjects = (value: unknown): Array<{ subject: string }> => {
  const rawSubjects = Array.isArray(value) ? value : value == null ? [] : [value]

  return rawSubjects
    .map((subject) => toNullableString(subject))
    .filter((subject): subject is string => subject != null)
    .map((subject) => ({ subject }))
}

const resolveEpubVersion = (book: Book): '2' | '3' => {
  const packaging = (book as Book & { packaging?: { navPath?: string | null } }).packaging

  return toNullableString(packaging?.navPath) ? '3' : '2'
}

const ensureNotAborted = (signal: AbortSignal): void => {
  if (signal.aborted) {
    throw new DOMException('Import canceled by user.', 'AbortError')
  }
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

const updateBookProgress = async (
  bookID: string | number,
  data: Record<string, unknown>,
): Promise<void> => {
  await requestJSONWithRetry<BookDocument>(
    `/api/books/${bookID}`,
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data),
    },
    { retries: 1 },
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
    { method: 'GET' },
    { signal },
  )

  const existingMedia = listResponse.docs[0]

  if (!existingMedia) {
    return null
  }

  if (typeof existingMedia.url !== 'string' || existingMedia.url.length === 0) {
    return null
  }

  return { id: existingMedia.id, url: existingMedia.url }
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
    { method: 'GET' },
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
    { method: 'GET' },
    { signal },
  )

  return listResponse.docs
}

const prewarmMediaCacheByFilename = async (
  sourceHash: string,
  signal: AbortSignal,
): Promise<Map<string, UploadedMedia>> => {
  const filenameCache = new Map<string, UploadedMedia>()

  try {
    const query = new URLSearchParams({
      depth: '0',
      limit: '500',
      'where[alt][contains]': sourceHash,
    })

    const response = await requestJSONWithRetry<PayloadListResponse<MediaDocument>>(
      `/api/media?${query.toString()}`,
      { method: 'GET' },
      { signal },
    )

    for (const doc of response.docs) {
      if (
        typeof doc.filename === 'string' &&
        doc.filename.length > 0 &&
        typeof doc.url === 'string' &&
        doc.url.length > 0
      ) {
        filenameCache.set(doc.filename, { id: doc.id, url: doc.url })
      }
    }
  } catch {
    // Pre-warm is best-effort; failures are non-fatal.
  }

  return filenameCache
}

const upsertChapterDocument = async (
  chapterData: Record<string, unknown>,
  chapterOrder: number,
  existingChaptersByOrder: Map<number, ChapterDocument>,
  signal: AbortSignal,
): Promise<void> => {
  const existingChapter = existingChaptersByOrder.get(chapterOrder) ?? null

  if (!existingChapter) {
    const createdChapter = await requestDocumentJSONWithRetry<ChapterDocument>(
      '/api/chapters',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(chapterData),
      },
      { signal },
    )

    existingChaptersByOrder.set(chapterOrder, createdChapter)
    return
  }

  const existingChapterID = normalizeDocumentID(existingChapter.id)

  const updatedChapter = await requestDocumentJSONWithRetry<ChapterDocument>(
    `/api/chapters/${existingChapterID}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(chapterData),
    },
    { signal },
  )

  existingChaptersByOrder.set(chapterOrder, updatedChapter)
}

const patchBookFailureState = async (bookID: string | number, reason: string): Promise<void> => {
  await updateBookProgress(bookID, {
    importErrorSummary: reason,
    importFailedAt: new Date().toISOString(),
    importStatus: 'failed',
    syncStatus: 'conflicted',
  })
}

const patchBookCanceledState = async (bookID: string | number): Promise<void> => {
  await updateBookProgress(bookID, {
    importStatus: 'canceled',
    importFinishedAt: null,
  })
}

const patchBookReadyState = async (
  bookID: string | number,
  completedChapters: number,
  skippedChapters: number,
  failureLogs: EpubFailureLog,
): Promise<void> => {
  await updateBookProgress(bookID, {
    importCompletedChapters: completedChapters,
    importErrorSummary:
      skippedChapters > 0
        ? `${skippedChapters} chapter${skippedChapters === 1 ? '' : 's'} were skipped during import.`
        : null,
    importFailedAt: null,
    importFailureLog: failureLogs,
    importFinishedAt: new Date().toISOString(),
    importStatus: 'ready',
    lastImportedAt: new Date().toISOString(),
    syncStatus: skippedChapters > 0 ? 'pending' : 'clean',
  })
}

// ---------------------------------------------------------------------------
// EPUB helpers
// ---------------------------------------------------------------------------

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
  filenamePrewarm: Map<string, UploadedMedia>,
  signal: AbortSignal,
  emit: Emit,
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
      emit({
        type: 'warning',
        message: `Skipped unsupported image format for asset "${resolvedAssetPath}". Allowed MIME types: ${Array.from(MEDIA_UPLOAD_ALLOWED_MIME_TYPES).join(', ')}.`,
      })
      return null
    }

    const stableFilename = createStableMediaFilename(
      resolvedAssetPath,
      normalizedBlob.mimeType,
      imageIndex + 1,
      filenameScope,
    )

    const prewarmed = filenamePrewarm.get(stableFilename)

    if (prewarmed) {
      mediaCache.set(resolvedAssetPath, prewarmed)
      return prewarmed
    }

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
      { signal },
    )

    if (typeof mediaResponse.url !== 'string' || mediaResponse.url.length === 0) {
      throw new Error(`Media upload succeeded without a URL for asset ${resolvedAssetPath}.`)
    }

    const uploadedMedia: UploadedMedia = {
      id: mediaResponse.id,
      url: mediaResponse.url,
    }

    mediaCache.set(resolvedAssetPath, uploadedMedia)
    emit({ type: 'image-uploaded' })

    return uploadedMedia
  })()

  mediaInFlight.set(resolvedAssetPath, uploadPromise)

  try {
    return await uploadPromise
  } finally {
    mediaInFlight.delete(resolvedAssetPath)
  }
}

const prepareChaptersForImport = async (
  book: Book,
  spineItems: SpineItem[],
  signal: AbortSignal,
  emit: Emit,
): Promise<PreparedChapter[]> => {
  const preparedChapters: PreparedChapter[] = []
  const tocItems = await book.loaded.navigation
    .then((navigation) => {
      return navigation.toc ?? []
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : 'Unknown table of contents failure.'
      emit({ type: 'warning', message: `Unable to load EPUB table of contents: ${message}` })
      return []
    })

  for (let chapterIndex = 0; chapterIndex < spineItems.length; chapterIndex += 1) {
    ensureNotAborted(signal)

    const spineItem = spineItems[chapterIndex]
    const chapterOrder = chapterIndex + 1
    const section = book.section(spineItem.index)

    emit({ type: 'phase', phase: 'Parsing' })
    emit({ type: 'status', message: `Analyzing chapter ${chapterOrder} of ${spineItems.length}...` })

    try {
      await Promise.resolve(section.load(book.load.bind(book)))
      const chapterHTML = section.document?.documentElement?.outerHTML ?? ''

      if (!chapterHTML) {
        emit({ type: 'warning', message: `Skipped chapter ${chapterOrder}: Unable to render chapter content.` })
        continue
      }

      const tocMetadata = resolveChapterTocMetadata(tocItems, spineItem.href ?? '')
      const chapterTitle =
        tocMetadata?.title ?? extractChapterTitle(chapterHTML, `Chapter ${chapterOrder}`, chapterOrder)
      const footnoteDefinitions = Array.from(collectFootnoteDefinitionsFromHTML(chapterHTML).values())

      preparedChapters.push({
        chapterTitle,
        chapterHTML,
        chapterOrder,
        footnoteDefinitions,
        tocHref: tocMetadata?.href ?? null,
        tocIdRef: tocMetadata?.id ?? null,
        tocTitle: tocMetadata?.title ?? null,
        spineHref: spineItem.href ?? '',
        spineIdRef: (spineItem as unknown as { idref?: string }).idref ?? null,
        wordCount: estimateWordCountFromHTML(chapterHTML),
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected chapter preflight failure.'
      emit({ type: 'warning', message: `Skipped chapter ${chapterOrder}: ${message}` })
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
  importedLanguage: string,
  sourceHash: string,
  preparedChapter: PreparedChapter,
  totalChapters: number,
  existingChaptersByOrder: Map<number, ChapterDocument>,
  existingChaptersBySourceKey: Map<string, ChapterDocument>,
  mediaCache: Map<string, UploadedMedia>,
  mediaInFlight: Map<string, Promise<UploadedMedia | null>>,
  filenamePrewarm: Map<string, UploadedMedia>,
  chapterDocument: Document,
  signal: AbortSignal,
  emit: Emit,
): Promise<ChapterProcessResult> => {
  ensureNotAborted(signal)

  const chapterOrder = preparedChapter.chapterOrder
  const chapterTitle = preparedChapter.chapterTitle

  // T3-4: Resumption checkpoint — skip this chapter if it was already successfully
  // created in a previous run of the same import batch AND has not been manually edited.
  const earlySourceKey = buildChapterSourceKey(
    preparedChapter.tocHref ?? preparedChapter.spineHref,
    preparedChapter.tocIdRef ?? preparedChapter.spineIdRef,
    chapterOrder,
  )
  const existingBySourceKey = existingChaptersBySourceKey.get(earlySourceKey)

  if (
    existingBySourceKey != null &&
    existingBySourceKey.importBatchId === importBatchID &&
    !existingBySourceKey.manualEditedAt
  ) {
    emit({ type: 'chapter-checkpointed', chapterOrder })
    return { success: true, checkpointed: true }
  }

  emit({ type: 'chapter-started', chapterOrder, totalChapters })
  emit({ type: 'phase', phase: 'Uploading Chapter' })
  emit({ type: 'status', message: `Processing chapter ${chapterOrder} of ${totalChapters}...` })

  try {
    const rawSanitizedChapter = sanitizeChapterHTML(preparedChapter.chapterHTML)
    const chapterImages = Array.from(
      chapterDocument.querySelectorAll('img[src], image[href], image[xlink\\:href]'),
    )

    for (let imageIndex = 0; imageIndex < chapterImages.length; imageIndex += 1) {
      ensureNotAborted(signal)

      const imageElement = chapterImages[imageIndex]

      if (imageElement.getAttribute('data-lexical-upload-id')) {
        continue
      }

      emit({ type: 'phase', phase: 'Uploading Images' })
      emit({
        type: 'status',
        message: `Uploading image ${imageIndex + 1} of ${chapterImages.length} in chapter ${chapterOrder}...`,
      })

      const imageSource =
        imageElement.getAttribute('src') ??
        imageElement.getAttribute('href') ??
        imageElement.getAttribute('xlink:href')

      if (!imageSource) {
        continue
      }

      const resolvedAssetPath = resolveEpubAssetPath(preparedChapter.spineHref, imageSource)

      if (!resolvedAssetPath) {
        emit({
          type: 'warning',
          message: `Skipped unresolved image source "${imageSource}" in chapter ${chapterOrder}.`,
        })
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
          filenamePrewarm,
          signal,
          emit,
        )
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unexpected image upload failure.'
        emit({ type: 'warning', message: `Skipped image ${imageIndex + 1} in chapter ${chapterOrder}: ${message}` })
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

    emit({ type: 'phase', phase: 'Uploading Chapter' })
    emit({ type: 'status', message: `Converting chapter ${chapterOrder} content to Lexical...` })

    const chapterHTMLWithUploadedImages = chapterDocument.documentElement.outerHTML
    const sanitizedChapter = sanitizeChapterHTML(chapterHTMLWithUploadedImages)
    const chapterSourceHash = buildStableHash(rawSanitizedChapter.html)
    const chapterSourceKey = buildChapterSourceKey(
      preparedChapter.tocHref ?? preparedChapter.spineHref,
      preparedChapter.tocIdRef ?? preparedChapter.spineIdRef,
      chapterOrder,
    )

    for (const warning of sanitizedChapter.warnings) {
      emit({ type: 'warning', message: `Chapter ${chapterOrder}: ${warning}` })
    }

    const footnotesById = new Map<string, FootnoteDefinition>()

    for (const footnoteDefinition of preparedChapter.footnoteDefinitions) {
      footnotesById.set(footnoteDefinition.noteId, footnoteDefinition)
    }

    const lexicalContent = convertHtmlToChapterLexicalState(sanitizedChapter.html, {
      footnotesById,
    })

    if (!isSubstantiveChapterContent(lexicalContent)) {
      emit({ type: 'warning', message: `Skipped chapter ${chapterOrder}: navigation-only or empty content.` })
      return { success: false }
    }

    const chapterSlugBase = createImportedBookSlug(chapterTitle, importedLanguage)
    const chapterSlug = chapterSlugBase
      ? `${chapterSlugBase}-${chapterOrder}`
      : `chapter-${chapterOrder}`

    await upsertChapterDocument(
      {
        _status: 'draft',
        book: bookID,
        chapterSourceHash,
        chapterSourceKey,
        chapterWordCount: preparedChapter.wordCount,
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

    emit({ type: 'chapter-completed' })

    return { success: true }
  } catch (error) {
    if (isAbortError(error) || signal.aborted) {
      throw error
    }

    const message = error instanceof Error ? error.message : 'Unexpected chapter import failure.'
    emit({ type: 'warning', message: `Skipped chapter ${chapterOrder}: ${message}` })
    return { success: false, failureReason: message }
  }
}

const processPreparedChapterWithRetry = async (
  book: Book,
  bookID: string | number,
  importBatchID: string,
  importedTitle: string,
  importedLanguage: string,
  sourceHash: string,
  preparedChapter: PreparedChapter,
  totalChapters: number,
  existingChaptersByOrder: Map<number, ChapterDocument>,
  existingChaptersBySourceKey: Map<string, ChapterDocument>,
  mediaCache: Map<string, UploadedMedia>,
  mediaInFlight: Map<string, Promise<UploadedMedia | null>>,
  filenamePrewarm: Map<string, UploadedMedia>,
  signal: AbortSignal,
  emit: Emit,
): Promise<ChapterProcessResult> => {
  const parser = new DOMParser()
  const chapterDocument = parser.parseFromString(preparedChapter.chapterHTML, 'text/html')

  let lastResult: ChapterProcessResult = { success: false }

  for (let attempt = 0; attempt <= MAX_CHAPTER_RETRY_ATTEMPTS; attempt += 1) {
    lastResult = await processPreparedChapter(
      book,
      bookID,
      importBatchID,
      importedTitle,
      importedLanguage,
      sourceHash,
      preparedChapter,
      totalChapters,
      existingChaptersByOrder,
      existingChaptersBySourceKey,
      mediaCache,
      mediaInFlight,
      filenamePrewarm,
      chapterDocument,
      signal,
      emit,
    )

    if (lastResult.success) {
      return lastResult
    }

    // Checkpoint skips must not be retried — the chapter was already stored successfully.
    if (lastResult.checkpointed) {
      return lastResult
    }

    if (attempt < MAX_CHAPTER_RETRY_ATTEMPTS) {
      emit({ type: 'phase', phase: 'Retrying' })
      emit({
        type: 'status',
        message: `Retrying chapter ${preparedChapter.chapterOrder} (${attempt + 1}/${MAX_CHAPTER_RETRY_ATTEMPTS})...`,
      })
      await sleep(150 * (attempt + 1))
    }
  }

  return lastResult
}

const processBatch = async (
  batch: PreparedChapter[],
  batchIndex: number,
  totalBatches: number,
  book: Book,
  bookID: string | number,
  importBatchID: string,
  importedTitle: string,
  importedLanguage: string,
  sourceHash: string,
  totalChapters: number,
  existingChaptersByOrder: Map<number, ChapterDocument>,
  existingChaptersBySourceKey: Map<string, ChapterDocument>,
  mediaCache: Map<string, UploadedMedia>,
  mediaInFlight: Map<string, Promise<UploadedMedia | null>>,
  filenamePrewarm: Map<string, UploadedMedia>,
  signal: AbortSignal,
  emit: Emit,
): Promise<BatchResult> => {
  for (let attempt = 0; attempt <= MAX_BATCH_RETRY_ATTEMPTS; attempt += 1) {
    try {
      emit({ type: 'phase', phase: 'Uploading Chapter' })
      emit({ type: 'status', message: `Processing batch ${batchIndex + 1} of ${totalBatches}...` })

      let completedChapters = 0
      let skippedChapters = 0
      const failureLogs: EpubFailureLog = []

      for (const preparedChapter of batch) {
        ensureNotAborted(signal)

        const chapterResult = await processPreparedChapterWithRetry(
          book,
          bookID,
          importBatchID,
          importedTitle,
          importedLanguage,
          sourceHash,
          preparedChapter,
          totalChapters,
          existingChaptersByOrder,
          existingChaptersBySourceKey,
          mediaCache,
          mediaInFlight,
          filenamePrewarm,
          signal,
          emit,
        )

        if (chapterResult.success) {
          completedChapters += 1
        } else {
          skippedChapters += 1

          if (chapterResult.failureReason) {
            failureLogs.push({
              chapterIndex: preparedChapter.chapterOrder,
              chapterTitle: preparedChapter.chapterTitle,
              error: chapterResult.failureReason,
              timestamp: new Date().toISOString(),
            })
          }
        }
      }

      return { completedChapters, failureLogs, skippedChapters }
    } catch (error) {
      if (isAbortError(error) || signal.aborted) {
        throw error
      }

      if (attempt < MAX_BATCH_RETRY_ATTEMPTS) {
        emit({ type: 'phase', phase: 'Retrying' })
        emit({
          type: 'status',
          message: `Retrying batch ${batchIndex + 1} (${attempt + 1}/${MAX_BATCH_RETRY_ATTEMPTS})...`,
        })
        await sleep(250 * (attempt + 1))
        continue
      }

      const message = error instanceof Error ? error.message : 'Unexpected batch import failure.'
      emit({ type: 'warning', message: `Skipped batch ${batchIndex + 1}: ${message}` })

      return {
        completedChapters: 0,
        failureLogs: batch.map((ch) => ({
          chapterIndex: ch.chapterOrder,
          chapterTitle: ch.chapterTitle,
          error: message,
          timestamp: new Date().toISOString(),
        })),
        skippedChapters: batch.length,
      }
    }
  }

  return { completedChapters: 0, failureLogs: [], skippedChapters: batch.length }
}

const processBookCover = async (
  book: Book,
  bookID: string | number,
  title: string,
  sourceHash: string,
  mediaCache: Map<string, UploadedMedia>,
  mediaInFlight: Map<string, Promise<UploadedMedia | null>>,
  filenamePrewarm: Map<string, UploadedMedia>,
  signal: AbortSignal,
  emit: Emit,
): Promise<void> => {
  ensureNotAborted(signal)

  let coverPath = ''

  const packaging = (book as any).packaging
  const manifest = packaging?.manifest ?? {}
  const metadata = packaging?.metadata ?? {}

  let coverManifestItem = Object.values(manifest).find(
    (item: any) => item?.properties?.includes('cover-image'),
  ) as any

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
      emit({ type: 'warning', message: 'Cover upload skipped: no cover image found in EPUB manifest.' })
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
      filenamePrewarm,
      signal,
      emit,
    )

    if (!uploadedMedia) {
      return
    }

    try {
      await updateBookProgress(bookID, { cover: uploadedMedia.id })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected cover update failure.'
      emit({
        type: 'warning',
        message: `Cover image uploaded for ${title}, but the book record could not be updated with the cover reference: ${message}`,
      })
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unexpected cover upload failure.'
    emit({
      type: 'warning',
      message: `Cover upload failed for ${title}. The import will continue without a cover image. ${message}`,
    })
  }
}

// ---------------------------------------------------------------------------
// Public API: async generator
// ---------------------------------------------------------------------------

export async function* runEpubImportPipeline(
  config: EpubPipelineConfig,
): AsyncGenerator<EpubPipelineEvent, void, undefined> {
  const { file, signal } = config

  // Buffer for events emitted by inner functions. Drained with yield* drain() at each
  // await checkpoint so the component receives progress updates progressively.
  const buf: EpubPipelineEvent[] = []
  const emit: Emit = (event) => { buf.push(event) }
  function* drain() {
    while (buf.length > 0) yield buf.shift()!
  }

  let bookId: string | number | null = null
  let openedBook: Book | null = null

  try {
    emit({ type: 'phase', phase: 'Parsing' })
    emit({ type: 'status', message: 'Opening EPUB and reading metadata...' })
    yield* drain()

    // Dynamically import ePub to avoid pulling browser-only code into server bundles
    const ePubModule = await import('epubjs')
    const ePub: (...args: any[]) => Book =
      typeof ePubModule.default === 'function'
        ? (ePubModule.default as any)
        : (ePubModule as any).default?.default ?? (ePubModule as any).default

    const epubData = await file.arrayBuffer()
    openedBook = ePub()
    await (openedBook as any).open(epubData, 'binary')
    await (openedBook as any).ready
    ensureNotAborted(signal)
    yield* drain()

    const metadata = await (openedBook as any).loaded.metadata
    const spine = (await (openedBook as any).loaded.spine) as unknown as { spineItems: SpineItem[] }
    const spineItems = spine.spineItems.filter((spineItem) => spineItem.linear !== 'no')

    if (spineItems.length === 0) {
      throw new Error('No readable chapters were found in the EPUB spine.')
    }

    const importBatchID = createImportBatchID()
    const importedTitle = createImportedBookTitle(metadata.title, file.name)
    const importedAuthor = toNullableString(metadata.creator)
    const importedLanguage = normalizeEpubLanguage(metadata.language)
    const importedDescription = toNullableString(metadata.description)
    const importedPublisher = toNullableString(metadata.publisher)
    const importedPublicationDate = toNullableString(metadata.pubdate)
    const importedIsbn = toNullableString(metadata.identifier)
    const importedSubjects = normalizeEpubSubjects((metadata as { subject?: unknown }).subject)
    const epubVersion = resolveEpubVersion(openedBook)
    const sourceHash = buildStableBinaryHash(epubData)
    const legacySourceHash = buildStableHash(`${file.name}:${file.size}:${file.lastModified}`)

    emit({ type: 'status', message: 'Checking for existing book records...' })
    yield* drain()

    const existingBooks = await findExistingBooksBySourceHashes(
      [sourceHash, legacySourceHash],
      signal,
    )
    const reusableBook = existingBooks[0] ?? null
    const duplicateBooks = existingBooks.slice(1)

    if (duplicateBooks.length > 0) {
      emit({
        type: 'warning',
        message: `Found ${duplicateBooks.length} older duplicate book record${duplicateBooks.length === 1 ? '' : 's'} for this EPUB. The importer will reuse the newest record and mark older duplicates as failed.`,
      })
    }

    if (reusableBook) {
      bookId = normalizeDocumentID(reusableBook.id)
      emit({ type: 'status', message: 'Reusing existing book record...' })
      yield* drain()

      await updateBookProgress(bookId, {
        author: importedAuthor,
        description: importedDescription,
        epubVersion,
        importBatchId: importBatchID,
        importCompletedChapters: 0,
        importErrorSummary: null,
        importFailedAt: null,
        importFinishedAt: null,
        importStartedAt: new Date().toISOString(),
        importStatus: 'importing',
        importTotalChapters: spineItems.length,
        isbn: importedIsbn,
        language: importedLanguage,
        publicationDate: importedPublicationDate,
        publisher: importedPublisher,
        subjects: importedSubjects,
        origin: 'epub-imported',
        sourceHash,
        sourceType: 'epub-upload',
        syncStatus: 'pending',
        title: importedTitle,
      })
    } else {
      emit({ type: 'status', message: 'Creating book record...' })
      yield* drain()

      const createdBook = await requestDocumentJSONWithRetry<BookDocument>(
        '/api/books',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            author: importedAuthor,
            description: importedDescription,
            epubVersion,
            importBatchId: importBatchID,
            importCompletedChapters: 0,
            importStartedAt: new Date().toISOString(),
            importStatus: 'importing',
            importTotalChapters: spineItems.length,
            isbn: importedIsbn,
            language: importedLanguage,
            publicationDate: importedPublicationDate,
            publisher: importedPublisher,
            subjects: importedSubjects,
            origin: 'epub-imported',
            sourceHash,
            sourceType: 'epub-upload',
            syncStatus: 'pending',
            title: importedTitle,
          }),
        },
        { signal },
      )

      bookId = normalizeDocumentID(createdBook.id)
    }

    emit({ type: 'book-created', bookId })
    yield* drain()

    for (const duplicateBook of duplicateBooks) {
      const duplicateBookID = normalizeDocumentID(duplicateBook.id)
      await updateBookProgress(duplicateBookID, {
        importErrorSummary: 'Superseded by a later import of the same EPUB.',
        importStatus: 'failed',
        syncStatus: 'conflicted',
      })
    }

    const mediaCache = new Map<string, UploadedMedia>()
    const mediaInFlight = new Map<string, Promise<UploadedMedia | null>>()
    const allFailureLogs: EpubFailureLog = []
    let completedChapters = 0

    const filenamePrewarm = reusableBook
      ? await prewarmMediaCacheByFilename(sourceHash, signal)
      : new Map<string, UploadedMedia>()

    const existingChapters = await findExistingChaptersByBook(bookId, signal)
    const existingChaptersByOrder = new Map<number, ChapterDocument>()
    // T3-4: Secondary index keyed by chapterSourceKey for O(1) resumption lookups.
    const existingChaptersBySourceKey = new Map<string, ChapterDocument>()

    for (const existingChapter of existingChapters) {
      const chapterOrderValue = (existingChapter as { order?: unknown }).order

      if (typeof chapterOrderValue === 'number' && Number.isFinite(chapterOrderValue)) {
        existingChaptersByOrder.set(chapterOrderValue, existingChapter)
      }

      const sourceKeyValue = existingChapter.chapterSourceKey

      if (typeof sourceKeyValue === 'string' && sourceKeyValue.length > 0) {
        existingChaptersBySourceKey.set(sourceKeyValue, existingChapter)
      }
    }

    const preparedChapters = await prepareChaptersForImport(openedBook, spineItems, signal, emit)
    yield* drain()

    const chapterBatches = createChapterBatches(
      preparedChapters,
      MAX_CHAPTERS_PER_BATCH,
      MAX_WORDS_PER_BATCH,
    )
    const totalWordCount = preparedChapters.reduce((sum, chapter) => sum + chapter.wordCount, 0)
    const chapterCount = preparedChapters.length
    const preflightSkippedChapters = Math.max(0, spineItems.length - preparedChapters.length)
    let skippedChapters = preflightSkippedChapters

    if (preparedChapters.length === 0) {
      throw new Error('No chapters could be prepared for import.')
    }

    await updateBookProgress(bookId, { chapterCount, totalWordCount })

    emit({ type: 'totals-known', totalChapters: spineItems.length })
    yield* drain()

    await processBookCover(
      openedBook,
      bookId,
      importedTitle,
      sourceHash,
      mediaCache,
      mediaInFlight,
      filenamePrewarm,
      signal,
      emit,
    )
    yield* drain()

    for (let batchIndex = 0; batchIndex < chapterBatches.length; batchIndex += 1) {
      const batchResult = await processBatch(
        chapterBatches[batchIndex],
        batchIndex,
        chapterBatches.length,
        openedBook,
        bookId,
        importBatchID,
        importedTitle,
        importedLanguage,
        sourceHash,
        preparedChapters.length,
        existingChaptersByOrder,
        existingChaptersBySourceKey,
        mediaCache,
        mediaInFlight,
        filenamePrewarm,
        signal,
        emit,
      )

      completedChapters += batchResult.completedChapters
      skippedChapters += batchResult.skippedChapters
      allFailureLogs.push(...batchResult.failureLogs)

      if (
        (batchIndex + 1) % PROGRESS_PATCH_INTERVAL === 0 ||
        batchIndex === chapterBatches.length - 1
      ) {
        await updateBookProgress(bookId, { importCompletedChapters: completedChapters })
      }

      yield* drain()
    }

    emit({ type: 'phase', phase: 'Finalizing' })
    emit({ type: 'status', message: 'Finalizing import status...' })
    yield* drain()

    await patchBookReadyState(bookId, completedChapters, skippedChapters, allFailureLogs)

    emit({ type: 'done', completedChapters, skippedChapters })
    yield* drain()
  } catch (error) {
    if (bookId != null) {
      if (isAbortError(error) || signal.aborted) {
        await patchBookCanceledState(bookId).catch(() => {})
      } else {
        const message = error instanceof Error ? error.message : 'Unknown EPUB import failure.'
        await patchBookFailureState(bookId, message).catch(() => {})
      }
    }

    throw error
  } finally {
    openedBook?.destroy()
  }
}
