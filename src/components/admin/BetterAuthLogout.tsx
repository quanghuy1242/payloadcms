'use client'

import { useState } from 'react'
import { requestJSON } from '@/utils/http'

type LogoutResponse = {
  success: boolean
  logoutUrl?: string | null
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
      // Logout from Payload (clears Payload cookies and revokes tokens)
      const { logoutUrl } = await requestJSON<LogoutResponse>('/api/auth/logout', {
        method: 'POST',
      })

      // Redirect to the logout URL
      // This will be the Better Auth domain to clear its cookies
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
        {pending ? 'Signing out..' : 'Sign out'}
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
