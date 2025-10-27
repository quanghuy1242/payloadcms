'use client'

import { useState } from 'react'

type LogoutResponse = {
  success: boolean
  logoutUrl?: string | null
}

const logout = async (): Promise<LogoutResponse> => {
  const response = await fetch('/api/auth/logout', {
    method: 'POST',
    credentials: 'include',
  })

  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || `Logout failed with status ${response.status}.`)
  }

  return (await response.json()) as LogoutResponse
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
      // First, logout from Payload (clears Payload cookies and revokes tokens)
      const { logoutUrl } = await logout()

      // Get Better Auth base URL from env
      const authBaseUrl = process.env.NEXT_PUBLIC_AUTH_BASE_URL || 'https://auth.quanghuy.dev'

      // Call Better Auth's sign-out endpoint to clear their session cookies
      // This must be done from the browser to clear HttpOnly cookies
      try {
        await fetch(`${authBaseUrl}/api/auth/sign-out`, {
          method: 'POST',
          credentials: 'include', // Important: include cookies
        })
      } catch (err) {
        console.warn('Failed to sign out from Better Auth:', err)
      }

      // Now redirect to Payload login
      window.location.href = logoutUrl || '/admin?loggedOut=1'
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
