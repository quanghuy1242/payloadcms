import { getAutherBaseUrl } from '@/lib/env'

import { getPayloadClientId } from './env'
import { requestJSON } from '@/utils/http'

type CheckBookPermissionResponse = {
  allowed?: boolean
}

type CheckBookPermissionArgs = {
  bookId: string | number
  sessionToken: string
}

export const checkAutherBookAccess = async ({ bookId, sessionToken }: CheckBookPermissionArgs): Promise<boolean> => {
  const entityType = `client_${getPayloadClientId()}:book`
  const url = new URL('/api/auth/check-permission', getAutherBaseUrl())

  const response = await requestJSON<CheckBookPermissionResponse>(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${sessionToken}`,
    },
    body: JSON.stringify({
      entityType,
      entityId: String(bookId),
      permission: 'view',
    }),
  })

  return response.allowed === true
}