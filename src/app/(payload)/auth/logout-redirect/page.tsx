'use client'

import { useEffect, useState } from 'react'

export default function LogoutRedirect() {
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const performLogout = async () => {
      try {
        // Get the Better Auth base URL from the query params
        const params = new URLSearchParams(window.location.search)
        const authBaseUrl = params.get('authBaseUrl') || 'https://auth.quanghuy.dev'
        const returnUrl = params.get('returnUrl') || '/admin?loggedOut=1'

        // POST to Better Auth's sign-out endpoint to clear their session
        // Note: This will clear Better Auth cookies via Set-Cookie headers
        const response = await fetch(`${authBaseUrl}/api/auth/sign-out`, {
          method: 'POST',
          credentials: 'include', // Important: include cookies in the request
          headers: {
            'Content-Type': 'application/json',
          },
        })

        // Whether it succeeds or fails, redirect back
        // (it might fail if already logged out, which is fine)
        window.location.href = returnUrl
      } catch (err) {
        console.error('Error during logout:', err)
        // Still redirect even on error
        const params = new URLSearchParams(window.location.search)
        const returnUrl = params.get('returnUrl') || '/admin?loggedOut=1'
        window.location.href = returnUrl
      }
    }

    performLogout()
  }, [])

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
      <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>Signing out...</div>
      <div style={{ color: '#666' }}>Please wait while we complete the sign-out process.</div>
    </div>
  )
}
