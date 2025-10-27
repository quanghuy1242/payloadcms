'use client'

import { useEffect } from 'react'

export default function LogoutRedirect() {
  useEffect(() => {
    // Get the Better Auth base URL from the query params
    const params = new URLSearchParams(window.location.search)
    const authBaseUrl = params.get('authBaseUrl') || 'https://auth.quanghuy.dev'
    const returnUrl = params.get('returnUrl') || '/admin?loggedOut=1'

    // Redirect to Better Auth's logout endpoint with a return URL
    // This ensures Better Auth clears its own session cookies
    const logoutUrl = new URL(`${authBaseUrl}/api/auth/sign-out`)
    logoutUrl.searchParams.set('callbackURL', returnUrl)

    // Use window.location.href for a full page navigation
    // This allows Better Auth to set cookies to clear the session
    window.location.href = logoutUrl.toString()
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
