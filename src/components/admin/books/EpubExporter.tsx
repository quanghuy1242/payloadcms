'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'

import type { EpubExportEvent, ExportPhase } from '@/utils/epubExportPipeline'
import { runEpubExportPipeline } from '@/utils/epubExportPipeline'

type ExportProgress = {
  serializedChapters: number
  totalChapters: number
  downloadedAssets: number
  totalAssets: number
}

type ExportState = {
  phase: ExportPhase
  statusMessage: string
  warnings: string[]
  isExporting: boolean
  progress: ExportProgress
  errorMessage: string | null
}

const INITIAL_STATE: ExportState = {
  phase: 'Idle',
  statusMessage: 'Ready to export.',
  warnings: [],
  isExporting: false,
  progress: {
    serializedChapters: 0,
    totalChapters: 0,
    downloadedAssets: 0,
    totalAssets: 0,
  },
  errorMessage: null,
}

export interface EpubExporterProps {
  bookId: string | number
}

export const EpubExporter: React.FC<EpubExporterProps> = ({ bookId }) => {
  const [state, setState] = useState<ExportState>(INITIAL_STATE)
  const abortControllerRef = useRef<AbortController | null>(null)
  const isExportingRef = useRef(false)
  const revokeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort()
      if (revokeTimeoutRef.current) {
        clearTimeout(revokeTimeoutRef.current)
      }
    }
  }, [])

  const appendWarnings = useCallback((newWarnings: string[]) => {
    if (newWarnings.length === 0) return
    setState((prev) => ({ ...prev, warnings: [...prev.warnings, ...newWarnings] }))
  }, [])

  const startExport = useCallback(async () => {
    if (isExportingRef.current) return
    isExportingRef.current = true

    if (revokeTimeoutRef.current) {
      clearTimeout(revokeTimeoutRef.current)
      revokeTimeoutRef.current = null
    }

    setState({
      ...INITIAL_STATE,
      isExporting: true,
      phase: 'Fetching Manifest',
      statusMessage: 'Fetching export manifest...',
    })

    const abortController = new AbortController()
    abortControllerRef.current = abortController

    let objectUrl: string | null = null

    try {
      for await (const event of runEpubExportPipeline({
        bookId,
        signal: abortController.signal,
      })) {
        handleExportEvent(event, setState, appendWarnings)

        if (event.type === 'done') {
          objectUrl = URL.createObjectURL(event.blob)
          const a = document.createElement('a')
          a.href = objectUrl
          a.download = event.filename
          document.body.appendChild(a)
          a.click()
          document.body.removeChild(a)
        }
      }
    } catch (error) {
      if (
        (error instanceof DOMException && error.name === 'AbortError') ||
        abortController.signal.aborted
      ) {
        setState((prev) => ({
          ...prev,
          phase: 'Canceled',
          statusMessage: 'Export canceled.',
          isExporting: false,
        }))
      } else {
        const message = error instanceof Error ? error.message : 'Unknown EPUB export failure.'
        setState((prev) => ({
          ...prev,
          phase: 'Failed',
          errorMessage: message,
          statusMessage: 'Export failed. See error details below.',
          isExporting: false,
        }))
      }
    } finally {
      abortControllerRef.current = null
      isExportingRef.current = false
      if (objectUrl) {
        // Delay revocation to give the browser time to start the download.
        revokeTimeoutRef.current = setTimeout(() => URL.revokeObjectURL(objectUrl!), 5000)
      }
      setState((prev) => {
        if (prev.phase !== 'Canceled' && prev.phase !== 'Failed' && prev.phase !== 'Done') {
          return { ...prev, isExporting: false }
        }
        return prev
      })
    }
  }, [bookId, appendWarnings])

  const cancelExport = useCallback(() => {
    abortControllerRef.current?.abort()
  }, [])

  return (
    <div className="epub-exporter">
      <div className="epub-exporter__controls">
        <button
          type="button"
          className="epub-exporter__start-button"
          disabled={state.isExporting}
          onClick={startExport}
        >
          {state.isExporting ? 'Exporting...' : 'Export as EPUB'}
        </button>

        <button
          type="button"
          className="epub-exporter__cancel-button"
          disabled={!state.isExporting}
          onClick={cancelExport}
        >
          Cancel Export
        </button>
      </div>

      <div className="epub-exporter__status">
        <p>
          <strong>Phase:</strong> {state.phase}
        </p>
        <p>{state.statusMessage}</p>
        {(state.progress.totalChapters > 0 || state.progress.totalAssets > 0) && (
          <div className="epub-exporter__progress">
            {state.progress.totalChapters > 0 && (
              <p>
                <strong>Chapters:</strong>{' '}
                {state.progress.serializedChapters}/{state.progress.totalChapters}
              </p>
            )}
            {state.progress.totalAssets > 0 && (
              <p>
                <strong>Assets:</strong>{' '}
                {state.progress.downloadedAssets}/{state.progress.totalAssets}
              </p>
            )}
          </div>
        )}
      </div>

      {state.errorMessage ? (
        <div className="epub-exporter__error">
          <strong>Error:</strong> {state.errorMessage}
        </div>
      ) : null}

      {state.warnings.length > 0 ? (
        <details className="epub-exporter__warnings">
          <summary>Warnings ({state.warnings.length})</summary>
          <ul>
            {state.warnings.map((warning, index) => (
              <li key={`${warning}-${index}`}>{warning}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  )
}

function handleExportEvent(
  event: EpubExportEvent,
  setState: React.Dispatch<React.SetStateAction<ExportState>>,
  appendWarnings: (warnings: string[]) => void,
): void {
  switch (event.type) {
    case 'phase':
      setState((prev) => {
        if (event.phase === 'Canceled') {
          return {
            ...prev,
            phase: event.phase,
            isExporting: false,
            statusMessage: 'Export canceled.',
          }
        }

        if (event.phase === 'Failed') {
          return {
            ...prev,
            phase: event.phase,
            isExporting: false,
            statusMessage: 'Export failed. See error details below.',
            errorMessage: prev.errorMessage ?? prev.warnings.at(-1) ?? 'EPUB export failed.',
          }
        }

        return { ...prev, phase: event.phase }
      })
      break
    case 'status':
      setState((prev) => ({ ...prev, statusMessage: event.message }))
      break
    case 'chapters-known':
      setState((prev) => ({
        ...prev,
        progress: { ...prev.progress, totalChapters: event.totalChapters },
      }))
      break
    case 'chapter-serialized':
      setState((prev) => ({
        ...prev,
        progress: {
          ...prev.progress,
          serializedChapters: event.completed,
          totalChapters: event.total,
        },
      }))
      break
    case 'asset-downloaded':
      setState((prev) => ({
        ...prev,
        progress: {
          ...prev.progress,
          downloadedAssets: event.completed,
          totalAssets: event.total,
        },
      }))
      break
    case 'warning':
      appendWarnings([event.message])
      break
    case 'done':
      setState((prev) => ({
        ...prev,
        phase: 'Done',
        statusMessage: `Export complete: ${event.filename}`,
        isExporting: false,
      }))
      break
  }
}

export default EpubExporter
