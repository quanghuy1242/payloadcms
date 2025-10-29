'use client'

import { useEffect } from 'react'

export default function LogoutRedirect() {
  useEffect(() => {
    const performLogout = async () => {
      try {
        // Get the Better Auth base URL from the query params
        const params = new URLSearchParams(window.location.search)
        const authBaseUrl = params.get('authBaseUrl') || 'https://auth.quanghuy.dev'
        const returnUrl = params.get('returnUrl') || '/admin?loggedOut=1'

        // POST to Better Auth's sign-out endpoint to clear their session
        await fetch(`${authBaseUrl}/api/auth/sign-out`, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({}),
        })

        // Redirect back after sign-out
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
    <section className="template-minimal template-minimal--width-normal">
      <div className="template-minimal__wrapper">
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
          <div style={{ fontSize: '1.5rem', fontWeight: 'bold' }}>Signing out...</div>
          <div style={{ color: '#666' }}>Please wait while we complete the sign-out process.</div>
        </div>
      </div>
    </section>
  )
}
