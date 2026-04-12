'use client'

import ePub, { type Book } from 'epubjs'
import type { SpineItem } from 'epubjs/types/section'
import React, { useRef, useState } from 'react'

import { normalizeEntityId } from '@/utils/access'
import { convertHtmlToChapterLexicalState } from '@/utils/epubLexical'
import {
  buildChapterSourceKey,
  buildStableHash,
  createImportBatchID,
  createImportedBookSlug,
  createImportedBookTitle,
  createStableMediaFilename,
  deriveImageAltText,
  ensureSupportedMediaBlob,
  extractChapterTitle,
  MEDIA_UPLOAD_ALLOWED_MIME_TYPES,
  resolveEpubAssetPath,
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

const CHAPTER_DELAY_MS = 150

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

  const findExistingChapterByOrder = async (
    bookID: string | number,
    chapterOrder: number,
    signal: AbortSignal,
  ): Promise<ChapterDocument | null> => {
    const query = new URLSearchParams({
      depth: '0',
      limit: '1',
      'where[book][equals]': String(bookID),
      'where[order][equals]': String(chapterOrder),
    })

    const listResponse = await requestJSONWithRetry<PayloadListResponse<ChapterDocument>>(
      `/api/chapters?${query.toString()}`,
      {
        method: 'GET',
      },
      { signal },
    )

    return listResponse.docs[0] ?? null
  }

  const findExistingBooksBySourceHash = async (
    sourceHash: string,
    signal: AbortSignal,
  ): Promise<BookDocument[]> => {
    const query = new URLSearchParams({
      depth: '0',
      limit: '10',
      sort: '-updatedAt',
      'where[origin][equals]': 'epub-imported',
      'where[sourceHash][equals]': sourceHash,
    })

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
    const candidatePaths = Array.from(
      new Set([assetPath, decodeURIComponent(assetPath)].filter((candidate) => candidate.length > 0)),
    )

    for (const candidatePath of candidatePaths) {
      try {
        return await book.archive.getBlob(candidatePath)
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
    mediaCache: Map<string, UploadedMedia>,
    signal: AbortSignal,
  ): Promise<UploadedMedia | null> => {
    const cached = mediaCache.get(resolvedAssetPath)

    if (cached) {
      return cached
    }

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
    )

    const existingMedia = await findExistingMediaByFilename(stableFilename, signal)

    if (existingMedia) {
      mediaCache.set(resolvedAssetPath, existingMedia)
      return existingMedia
    }

    const mediaFormData = new FormData()
    mediaFormData.append('file', normalizedBlob.blob, stableFilename)
    mediaFormData.append('alt', mediaAltText)

    const mediaResponse = await requestJSONWithRetry<MediaDocument>(
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
  }

  const upsertChapterDocument = async (
    chapterData: Record<string, unknown>,
    bookID: string | number,
    chapterOrder: number,
    signal: AbortSignal,
  ) => {
    const existingChapter = await findExistingChapterByOrder(bookID, chapterOrder, signal)

    if (!existingChapter) {
      await requestJSONWithRetry<ChapterDocument>(
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

      return
    }

    const existingChapterID = normalizeDocumentID(existingChapter.id)

    await requestJSONWithRetry<ChapterDocument>(
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

  const patchBookReadyState = async (bookID: string | number, completedChapters: number) => {
    await updateBookProgress(bookID, {
      importStatus: 'ready',
      importCompletedChapters: completedChapters,
    })
  }

  const processChapter = async (
    book: Book,
    bookID: string | number,
    importBatchID: string,
    spineItem: SpineItem,
    chapterIndex: number,
    totalChapters: number,
    mediaCache: Map<string, UploadedMedia>,
    signal: AbortSignal,
  ) => {
    ensureNotAborted(signal)

    const chapterOrder = chapterIndex + 1

    setProgress((existingProgress) => {
      return {
        ...existingProgress,
        currentChapter: chapterOrder,
        totalChapters,
      }
    })

    setPhase('Uploading Chapter')
    setStatusMessage(`Processing chapter ${chapterOrder} of ${totalChapters}...`)

    const section = book.section(spineItem.index)

    try {
      await Promise.resolve(section.load(book.load.bind(book)))

      const renderedSection = await Promise.resolve(section.render(book.load.bind(book)))
      const chapterHTML =
        typeof renderedSection === 'string'
          ? renderedSection
          : section.document?.documentElement?.outerHTML ?? ''

      if (!chapterHTML) {
        throw new Error(`Unable to render chapter ${chapterOrder}.`)
      }

      const parser = new DOMParser()
      const chapterDocument = parser.parseFromString(chapterHTML, 'text/html')
      const chapterTitle = extractChapterTitle(chapterHTML, `Chapter ${chapterOrder}`, chapterOrder)
      const chapterImages = Array.from(chapterDocument.querySelectorAll('img'))

      for (let imageIndex = 0; imageIndex < chapterImages.length; imageIndex += 1) {
        ensureNotAborted(signal)

        setPhase('Uploading Images')
        setStatusMessage(
          `Uploading image ${imageIndex + 1} of ${chapterImages.length} in chapter ${chapterOrder}...`,
        )

        const imageElement = chapterImages[imageIndex]
        const imageSource = imageElement.getAttribute('src')

        if (!imageSource) {
          continue
        }

        const resolvedAssetPath = resolveEpubAssetPath(spineItem.href ?? '', imageSource)

        if (!resolvedAssetPath) {
          appendWarnings([
            `Skipped unresolved image source \"${imageSource}\" in chapter ${chapterOrder}.`,
          ])
          continue
        }

        const uploadedMedia = await uploadAssetAsMedia(
          book,
          resolvedAssetPath,
          deriveImageAltText(imageElement, chapterTitle, imageIndex),
          imageIndex,
          mediaCache,
          signal,
        )

        if (!uploadedMedia) {
          continue
        }

        imageElement.setAttribute('src', uploadedMedia.url)
        imageElement.removeAttribute('srcset')

        const derivedAlt = deriveImageAltText(imageElement, chapterTitle, imageIndex)
        imageElement.setAttribute('alt', derivedAlt)
      }

      setPhase('Uploading Chapter')
      setStatusMessage(`Converting chapter ${chapterOrder} content to Lexical...`)

      const chapterHTMLWithUploadedImages = chapterDocument.documentElement.outerHTML
      const sanitizedChapter = sanitizeChapterHTML(chapterHTMLWithUploadedImages)
      const chapterSourceHash = buildStableHash(sanitizedChapter.html)
      const chapterSourceKey = buildChapterSourceKey(
        spineItem.href ?? '',
        section.idref ?? null,
        chapterOrder,
      )

      appendWarnings(
        sanitizedChapter.warnings.map((warning) => {
          return `Chapter ${chapterOrder}: ${warning}`
        }),
      )

      const lexicalContent = convertHtmlToChapterLexicalState(sanitizedChapter.html)
      const chapterSlug = createImportedBookSlug(chapterTitle) || `chapter-${chapterOrder}`

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
        bookID,
        chapterOrder,
        signal,
      )

      setProgress((existingProgress) => {
        return {
          ...existingProgress,
          completedChapters: chapterOrder,
        }
      })

      await updateBookProgress(
        bookID,
        {
          importCompletedChapters: chapterOrder,
        },
        signal,
      )

      await sleep(CHAPTER_DELAY_MS)
    } finally {
      section.unload()
    }
  }

  const processBookCover = async (
    book: Book,
    bookID: string | number,
    title: string,
    mediaCache: Map<string, UploadedMedia>,
    signal: AbortSignal,
  ) => {
    ensureNotAborted(signal)

    let coverPath = ''

    try {
      coverPath = await book.loaded.cover
    } catch {
      return
    }

    if (!coverPath) {
      return
    }

    const resolvedCoverPath = resolveEpubAssetPath('', coverPath)

    if (!resolvedCoverPath) {
      return
    }

    try {
      const uploadedMedia = await uploadAssetAsMedia(
        book,
        resolvedCoverPath,
        `Cover image for ${title}`,
        0,
        mediaCache,
        signal,
      )

      if (!uploadedMedia) {
        return
      }

      await updateBookProgress(
        bookID,
        {
          cover: uploadedMedia.id,
        },
        signal,
      )
    } catch {
      appendWarnings([`Cover upload failed for ${title}. The import will continue without a cover image.`])
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
      const sourceHash = buildStableHash(`${file.name}:${file.size}:${file.lastModified}`)

      const existingBooks = await findExistingBooksBySourceHash(sourceHash, abortController.signal)
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

      await processBookCover(
        openedBook,
        createdBookID,
        importedTitle,
        mediaCache,
        abortController.signal,
      )

      for (let chapterIndex = 0; chapterIndex < spineItems.length; chapterIndex += 1) {
        ensureNotAborted(abortController.signal)

        await processChapter(
          openedBook,
          createdBookID,
          importBatchID,
          spineItems[chapterIndex],
          chapterIndex,
          spineItems.length,
          mediaCache,
          abortController.signal,
        )
      }

      setPhase('Finalizing')
      setStatusMessage('Finalizing import status...')

      await patchBookReadyState(createdBookID, spineItems.length)

      setPhase('Done')
      setStatusMessage(
        `Import completed. ${spineItems.length} chapter${spineItems.length === 1 ? '' : 's'} created.`,
      )
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
          border-radius: 8px;
          padding: 1.25rem;
          margin-bottom: 1.5rem;
          background: var(--theme-elevation-50);
          display: grid;
          gap: 1rem;
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
