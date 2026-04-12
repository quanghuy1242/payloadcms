'use client'

import { useCallback, useEffect, useState } from 'react'
import { requestJSON } from '@/utils/http'

const BetterAuthLoginRedirect = () => {
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(true)

  const beginRedirect = useCallback(async () => {
    setPending(true)
    setError(null)

    try {
      const payload = await requestJSON<{
        authorizeURL?: string
        authorizeUrl?: string
      }>('/api/auth/url', {
        method: 'GET',
      })
      const authorizeUrl = payload.authorizeURL ?? payload.authorizeUrl

      if (!authorizeUrl) {
        throw new Error('Authorize URL missing from response.')
      }

      window.location.replace(authorizeUrl)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected error preparing Better Auth login.')
      setPending(false)
    }
  }, [])

  useEffect(() => {
    void beginRedirect()
  }, [beginRedirect])

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'system-ui, sans-serif',
        flexDirection: 'column',
        gap: '1rem',
      }}
    >
      <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>Signing in...</div>
      <p style={{ color: '#666' }}>Please wait while we send you to the sign-in page.</p>
      {error ? (
        <>
          <p style={{ color: 'var(--theme-error-500, #c00)', maxWidth: '32rem' }}>{error}</p>
          <button type="button" className="btn btn--style-primary" onClick={() => beginRedirect()}>
            Try again
          </button>
        </>
      ) : null}
      {pending ? <span className="loading loading--lg" aria-hidden="true" /> : null}
    </div>
  )
}

export default BetterAuthLoginRedirect
