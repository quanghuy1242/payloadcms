'use client'

import { Button } from '@payloadcms/ui'
import { useState } from 'react'

import { requestJSONWithRetry } from '@/utils/http'

type ReconcileResult = {
  ok?: boolean
  inserted?: number
  revoked?: number
  flagUpdated?: number
  usersProcessed?: number
  errors?: string[]
  error?: string
}

const ReconcileGrantsButton = () => {
  const [isRunning, setIsRunning] = useState(false)
  const [result, setResult] = useState<ReconcileResult | null>(null)

  const handleReconcile = async (): Promise<void> => {
    setIsRunning(true)
    setResult(null)

    try {
      const response = await requestJSONWithRetry<ReconcileResult>('/api/internal/reconcile', {
        method: 'POST',
      })

      setResult(response)
    } catch (error) {
      setResult({ error: error instanceof Error ? error.message : 'Reconciliation failed.' })
    } finally {
      setIsRunning(false)
    }
  }

  return (
    <div
      style={{
        border: '1px solid var(--theme-elevation-200, #d1d5db)',
        borderRadius: '8px',
        display: 'grid',
        gap: '0.75rem',
        padding: '1rem',
      }}
    >
      <div style={{ display: 'grid', gap: '0.25rem' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Grant mirror reconciliation</h3>
        <p style={{ color: 'var(--theme-elevation-600, #4b5563)', margin: 0, fontSize: '0.875rem' }}>
          Sync the local grant mirror against Auther. Inserts missing rows, revokes stale rows, and
          corrects requiresLiveCheck flags.
        </p>
      </div>

      <div>
        <Button
          buttonStyle="secondary"
          disabled={isRunning}
          onClick={() => void handleReconcile()}
          size="small"
        >
          {isRunning ? 'Reconciling...' : 'Run reconciliation'}
        </Button>
      </div>

      {result ? (
        <div style={{ fontSize: '0.875rem' }}>
          {result.error ? (
            <p style={{ color: 'var(--theme-error-500, #c00)', margin: 0 }}>{result.error}</p>
          ) : (
            <dl style={{ display: 'grid', gap: '0.25rem', margin: 0 }}>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <dt style={{ fontWeight: 600 }}>Users processed:</dt>
                <dd style={{ margin: 0 }}>{result.usersProcessed ?? 0}</dd>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <dt style={{ fontWeight: 600 }}>Inserted:</dt>
                <dd style={{ margin: 0 }}>{result.inserted ?? 0}</dd>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <dt style={{ fontWeight: 600 }}>Revoked:</dt>
                <dd style={{ margin: 0 }}>{result.revoked ?? 0}</dd>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <dt style={{ fontWeight: 600 }}>Flag updated:</dt>
                <dd style={{ margin: 0 }}>{result.flagUpdated ?? 0}</dd>
              </div>
              {result.errors && result.errors.length > 0 ? (
                <div>
                  <dt style={{ fontWeight: 600, color: 'var(--theme-error-500, #c00)' }}>
                    Errors ({result.errors.length}):
                  </dt>
                  <dd style={{ margin: 0 }}>
                    <ul style={{ margin: '0.25rem 0 0', paddingLeft: '1rem' }}>
                      {result.errors.slice(0, 5).map((e, i) => (
                        // eslint-disable-next-line react/no-array-index-key
                        <li key={i}>{e}</li>
                      ))}
                      {result.errors.length > 5 ? (
                        <li>…and {result.errors.length - 5} more</li>
                      ) : null}
                    </ul>
                  </dd>
                </div>
              ) : null}
            </dl>
          )}
        </div>
      ) : null}
    </div>
  )
}

export default ReconcileGrantsButton
