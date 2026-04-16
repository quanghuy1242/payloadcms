'use client'

import { useRouter } from 'next/navigation'
import React, { useRef, useState } from 'react'

import type { ImportPhase, ImportProgress } from '@/utils/epubPipeline'
import { runEpubImportPipeline } from '@/utils/epubPipeline'

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

    let shouldRefreshBooks = false

    try {
      for await (const event of runEpubImportPipeline({ file, signal: abortController.signal })) {
        switch (event.type) {
          case 'phase':
            setPhase(event.phase)
            break
          case 'status':
            setStatusMessage(event.message)
            break
          case 'warning':
            appendWarnings([event.message])
            break
          case 'image-uploaded':
            setProgress((prev) => ({ ...prev, uploadedImages: prev.uploadedImages + 1 }))
            break
          case 'totals-known':
            setProgress((prev) => ({ ...prev, totalChapters: event.totalChapters, currentChapter: 0 }))
            break
          case 'chapter-started':
            setProgress((prev) => ({
              ...prev,
              currentChapter: Math.max(prev.currentChapter, event.chapterOrder),
              totalChapters: event.totalChapters,
            }))
            break
          case 'chapter-completed':
            setProgress((prev) => ({
              ...prev,
              completedChapters: Math.min(prev.totalChapters, prev.completedChapters + 1),
            }))
            break
          case 'done': {
            const { completedChapters, skippedChapters } = event
            setPhase('Done')
            setStatusMessage(
              skippedChapters > 0
                ? `Import completed with ${skippedChapters} skipped chapter${skippedChapters === 1 ? '' : 's'}.`
                : `Import completed. ${completedChapters} chapter${completedChapters === 1 ? '' : 's'} created.`,
            )
            shouldRefreshBooks = true
            break
          }
        }
      }
    } catch (error) {
      if (
        (error instanceof DOMException && error.name === 'AbortError') ||
        abortController.signal.aborted
      ) {
        setPhase('Canceled')
        setStatusMessage('Import canceled. Any chapters already written were kept as draft.')
      } else {
        const message = error instanceof Error ? error.message : 'Unknown EPUB import failure.'
        setPhase('Failed')
        setErrorMessage(message)
        setStatusMessage('Import failed. See error details below.')
      }
    } finally {
      abortControllerRef.current = null
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

      {errorMessage ? (
        <div className="epub-importer__error">
          <strong>Error:</strong> {errorMessage}
        </div>
      ) : null}

      {warnings.length > 0 ? (
        <details className="epub-importer__warnings">
          <summary>Warnings ({warnings.length})</summary>
          <ul>
            {warnings.map((warning, index) => {
              return <li key={`${warning}-${index}`}>{warning}</li>
            })}
          </ul>
        </details>
      ) : null}
    </div>
  )
}

export default EpubImporter
