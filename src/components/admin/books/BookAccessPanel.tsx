'use client'

import { Button, useDocumentInfo } from '@payloadcms/ui'
import { useEffect, useState } from 'react'

import { requestJSONWithRetry } from '@/utils/http'

type GrantEntry = {
  relation: string
  tupleId: string
  userEmail: string
  userId: string
}

type GrantListResponse = {
  grants?: GrantEntry[]
}

const ACCESS_RELATION = 'reader' as const

type SubjectType = 'user' | 'group'

const BookAccessPanel = () => {
  const { id, data } = useDocumentInfo()
  const bookId = typeof id === 'string' || typeof id === 'number' ? id : null
  const isPrivate = (data as { visibility?: string } | null | undefined)?.visibility === 'private'

  const [grants, setGrants] = useState<GrantEntry[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [subjectType, setSubjectType] = useState<SubjectType>('user')
  const [emailInput, setEmailInput] = useState('')
  const [groupIdInput, setGroupIdInput] = useState('')
  const [error, setError] = useState<string | null>(null)

  const normalizedEmail = emailInput.trim().toLowerCase()
  const normalizedGroupId = groupIdInput.trim()
  const isInputValid =
    subjectType === 'user' ? normalizedEmail.length > 0 : normalizedGroupId.length > 0

  const fetchGrants = async (signal?: AbortSignal): Promise<GrantEntry[]> => {
    if (bookId == null) {
      return []
    }

    const response = await requestJSONWithRetry<GrantListResponse>(
      `/api/books/${bookId}/access`,
      {},
      signal ? { signal } : {},
    )

    return response.grants ?? []
  }

  useEffect(() => {
    if (!isPrivate || bookId == null) {
      setGrants([])
      setError(null)
      setIsLoading(false)
      return undefined
    }

    const controller = new AbortController()
    let isMounted = true

    setIsLoading(true)
    setError(null)

    void fetchGrants(controller.signal)
      .then((nextGrants) => {
        if (!isMounted || controller.signal.aborted) {
          return
        }

        setGrants(nextGrants)
      })
      .catch((nextError) => {
        if (!isMounted || controller.signal.aborted) {
          return
        }

        setGrants([])
        setError(nextError instanceof Error ? nextError.message : 'Failed to load book access.')
      })
      .finally(() => {
        if (isMounted && !controller.signal.aborted) {
          setIsLoading(false)
        }
      })

    return () => {
      isMounted = false
      controller.abort()
    }
  }, [bookId, isPrivate])

  const refreshGrants = async (): Promise<void> => {
    const nextGrants = await fetchGrants()
    setGrants(nextGrants)
  }

  const handleGrant = async (): Promise<void> => {
    if (bookId == null || isSaving || !isInputValid) {
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      if (subjectType === 'user') {
        await requestJSONWithRetry(`/api/books/${bookId}/access`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: normalizedEmail,
            relation: ACCESS_RELATION,
          }),
        })
        setEmailInput('')
      } else {
        await requestJSONWithRetry(`/api/books/${bookId}/access`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            groupId: normalizedGroupId,
            subjectType: 'group',
            relation: ACCESS_RELATION,
          }),
        })
        setGroupIdInput('')
      }

      await refreshGrants()
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to grant access.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleRevoke = async (tupleId: string): Promise<void> => {
    if (bookId == null || isSaving) {
      return
    }

    setIsSaving(true)
    setError(null)

    try {
      await requestJSONWithRetry(`/api/books/${bookId}/access`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tupleId }),
      })

      setGrants((previousGrants) => previousGrants.filter((grant) => grant.tupleId !== tupleId))
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Failed to revoke access.')
    } finally {
      setIsSaving(false)
    }
  }

  if (!isPrivate) {
    return null
  }

  if (bookId == null) {
    return (
      <section
        style={{
          border: '1px solid var(--theme-elevation-200, #d1d5db)',
          borderRadius: '8px',
          display: 'grid',
          gap: '0.75rem',
          padding: '1rem',
        }}
      >
        <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Book access</h3>
        <p style={{ color: 'var(--theme-elevation-600, #4b5563)', margin: 0 }}>
          Save the book before managing access.
        </p>
      </section>
    )
  }

  const subjectTabStyle = (active: boolean): React.CSSProperties => ({
    background: active ? 'var(--theme-elevation-100, #f3f4f6)' : 'transparent',
    border: '1px solid var(--theme-elevation-200, #d1d5db)',
    borderRadius: '6px',
    cursor: 'pointer',
    fontSize: '0.875rem',
    fontWeight: active ? 600 : 400,
    padding: '0.375rem 0.75rem',
  })

  return (
    <section
      style={{
        border: '1px solid var(--theme-elevation-200, #d1d5db)',
        borderRadius: '8px',
        display: 'grid',
        gap: '0.75rem',
        padding: '1rem',
      }}
    >
      <div style={{ display: 'grid', gap: '0.25rem' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 600, margin: 0 }}>Book access</h3>
        <p style={{ color: 'var(--theme-elevation-600, #4b5563)', margin: 0 }}>
          Grant reader access to a user or group for this private book.
        </p>
      </div>

      {error ? <p style={{ color: 'var(--theme-error-500, #c00)', margin: 0 }}>{error}</p> : null}

      {isLoading ? <p style={{ margin: 0 }}>Loading access grants...</p> : null}

      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th
              style={{
                borderBottom: '1px solid var(--theme-elevation-200, #d1d5db)',
                textAlign: 'left',
              }}
            >
              User
            </th>
            <th
              style={{
                borderBottom: '1px solid var(--theme-elevation-200, #d1d5db)',
                textAlign: 'left',
              }}
            >
              Relation
            </th>
            <th
              style={{
                borderBottom: '1px solid var(--theme-elevation-200, #d1d5db)',
                textAlign: 'right',
              }}
            ></th>
          </tr>
        </thead>
        <tbody>
          {grants.map((grant) => (
            <tr key={grant.tupleId}>
              <td
                style={{
                  borderBottom: '1px solid var(--theme-elevation-100, #e5e7eb)',
                  padding: '0.5rem 0',
                }}
              >
                {grant.userEmail}
              </td>
              <td
                style={{
                  borderBottom: '1px solid var(--theme-elevation-100, #e5e7eb)',
                  padding: '0.5rem 0',
                }}
              >
                {grant.relation}
              </td>
              <td
                style={{
                  borderBottom: '1px solid var(--theme-elevation-100, #e5e7eb)',
                  padding: '0.5rem 0',
                  textAlign: 'right',
                }}
              >
                <Button
                  buttonStyle="secondary"
                  disabled={isSaving}
                  onClick={() => void handleRevoke(grant.tupleId)}
                  size="small"
                >
                  Revoke
                </Button>
              </td>
            </tr>
          ))}
          {grants.length === 0 && !isLoading ? (
            <tr>
              <td
                colSpan={3}
                style={{ color: 'var(--theme-elevation-500, #6b7280)', padding: '0.5rem 0' }}
              >
                No users have been granted access yet.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>

      {/* Subject type toggle */}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          disabled={isSaving}
          onClick={() => setSubjectType('user')}
          style={subjectTabStyle(subjectType === 'user')}
          type="button"
        >
          User
        </button>
        <button
          disabled={isSaving}
          onClick={() => setSubjectType('group')}
          style={subjectTabStyle(subjectType === 'group')}
          type="button"
        >
          Group
        </button>
      </div>

      <div style={{ display: 'flex', gap: '0.75rem' }}>
        {subjectType === 'user' ? (
          <input
            aria-label="User email"
            disabled={isSaving}
            onChange={(event) => setEmailInput(event.target.value)}
            placeholder="User email"
            type="email"
            value={emailInput}
            style={{
              border: '1px solid var(--theme-elevation-200, #d1d5db)',
              borderRadius: '6px',
              flex: 1,
              minWidth: 0,
              padding: '0.5rem 0.75rem',
            }}
          />
        ) : (
          <input
            aria-label="Group ID"
            disabled={isSaving}
            onChange={(event) => setGroupIdInput(event.target.value)}
            placeholder="Auther group ID"
            type="text"
            value={groupIdInput}
            style={{
              border: '1px solid var(--theme-elevation-200, #d1d5db)',
              borderRadius: '6px',
              flex: 1,
              minWidth: 0,
              padding: '0.5rem 0.75rem',
            }}
          />
        )}
        <Button
          buttonStyle="secondary"
          disabled={isSaving || !isInputValid}
          onClick={() => void handleGrant()}
          size="small"
        >
          {isSaving ? 'Saving...' : `Grant reader`}
        </Button>
      </div>
    </section>
  )
}

export default BookAccessPanel
