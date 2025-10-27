'use client'

import { useState } from 'react'

const logout = async (): Promise<void> => {
  const response = await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'include',
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || `Logout failed with status ${response.status}.`)
  }
}

const BetterAuthLogout = () => {
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const handleLogout = async () => {
    if (pending) {
      return
    }

    setPending(true)
    setError(null)

    try {
      await logout()
      window.location.replace('/admin')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unexpected logout error.')
      setPending(false)
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleLogout}
        disabled={pending}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          textDecoration: 'underline',
          cursor: 'pointer',
          fontSize: 'inherit',
          fontFamily: 'inherit',
        }}
      >
        {pending ? 'Signing out…' : 'Sign out'}
      </button>
      {error ? (
        <p
          style={{
            color: 'var(--theme-error-500, #c00)',
            marginTop: '0.75rem',
            fontSize: '0.875rem',
          }}
        >
          {error}
        </p>
      ) : null}
    </div>
  )
}

export default BetterAuthLogout
