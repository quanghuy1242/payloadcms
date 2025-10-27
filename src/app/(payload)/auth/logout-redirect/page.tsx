'use client'

import { useEffect } from 'react'

export default function LogoutRedirect() {
  useEffect(() => {
    // Get the Better Auth base URL from the query params
    const params = new URLSearchParams(window.location.search)
    const authBaseUrl = params.get('authBaseUrl') || 'https://auth.quanghuy.dev'
    const returnUrl = params.get('returnUrl') || '/admin?loggedOut=1'

    // Create a form to POST to Better Auth's sign-out endpoint
    // This is a workaround for CORS - using a form submission instead of fetch
    const form = document.createElement('form')
    form.method = 'POST'
    form.action = `${authBaseUrl}/api/auth/sign-out`
    form.style.display = 'none'

    // Add a hidden input for the return URL (if Better Auth supports it)
    const input = document.createElement('input')
    input.type = 'hidden'
    input.name = 'redirect'
    input.value = returnUrl
    form.appendChild(input)

    document.body.appendChild(form)

    // Submit the form, which will clear Better Auth cookies
    // Then use a meta refresh to redirect back
    form.submit()

    // Fallback: redirect after a short delay
    setTimeout(() => {
      window.location.href = returnUrl
    }, 1000)
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
