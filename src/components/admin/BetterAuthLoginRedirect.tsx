'use client'

import { useCallback, useEffect, useState } from 'react'

const fetchAuthorizeUrl = async (): Promise<string> => {
  const response = await fetch('/api/auth/url', {
    method: 'GET',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
  })

  if (!response.ok) {
    const body = await response.text().catch(() => response.statusText)
    throw new Error(body || `Failed to generate authorize URL (${response.status}).`)
  }

  const payload = (await response.json()) as { authorizeURL?: string; authorizeUrl?: string }
  const url = payload.authorizeURL ?? payload.authorizeUrl

  if (!url) {
    throw new Error('Authorize URL missing from response.')
  }

  return url
}

const BetterAuthLoginRedirect = () => {
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(true)

  const beginRedirect = useCallback(async () => {
    setPending(true)
    setError(null)

    try {
      const authorizeUrl = await fetchAuthorizeUrl()
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
        minHeight: '100vh',
        fontFamily: 'system-ui, sans-serif',
        flexDirection: 'column',
        gap: '1rem',
      }}
    >
      <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>Redirecting…</div>
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
