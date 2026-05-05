export const getCookieValue = (cookieHeader: string, cookieName: string): string | null => {
  const segments = cookieHeader.split(';')

  for (const segment of segments) {
    const [rawName, ...rawValueParts] = segment.split('=')

    if (!rawName || rawValueParts.length === 0) {
      continue
    }

    if (rawName.trim() !== cookieName) {
      continue
    }

    const value = rawValueParts.join('=').trim()

    return value.length > 0 ? decodeURIComponent(value) : null
  }

  return null
}
