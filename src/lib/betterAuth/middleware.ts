import type { Application, NextFunction, Request, Response } from 'express'
import type { Payload } from 'payload'

import { createAuthorizeUrl, getExpressAuthorizeCookieOptions } from './authorize'

const WWW_AUTHENTICATE_HEADER = 'Bearer realm="Better Auth"'

const shouldHandleRequest = (req: Request, adminPath: string): boolean => {
  if (!req.path) {
    return false
  }

  const isAdminPath = req.path === adminPath || req.path.startsWith(`${adminPath}/`)

  if (!isAdminPath) {
    return false
  }

  return true
}

const redirectToBetterAuth = async (res: Response) => {
  const { authorizeUrl, cookieName, cookieValue } = await createAuthorizeUrl()

  res.cookie(cookieName, cookieValue, getExpressAuthorizeCookieOptions())
  res.redirect(authorizeUrl)
}

const handleUnauthenticatedRequest = async (req: Request, res: Response) => {
  const acceptsHtml = req.accepts(['html', 'json']) === 'html'

  if (acceptsHtml) {
    await redirectToBetterAuth(res)

    return
  }

  res.status(401).set('WWW-Authenticate', WWW_AUTHENTICATE_HEADER).send('Authentication required.')
}

const createMiddleware =
  (payload: Payload, adminPath: string) =>
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (!shouldHandleRequest(req, adminPath)) {
        return next()
      }

      if ((req as unknown as { user?: unknown }).user) {
        return next()
      }

      await handleUnauthenticatedRequest(req, res)
    } catch (error) {
      payload.logger.error(
        error instanceof Error
          ? error
          : new Error('Unexpected error in Better Auth middleware while handling request.'),
      )
      res.status(500).send('Failed to initiate authentication.')
    }
  }

type PayloadWithExpress = Payload & {
  express?: Application
}

export const attachBetterAuthAdminMiddleware = (payload: Payload) => {
  const app = (payload as PayloadWithExpress).express

  if (!app) {
    payload.logger.warn(
      'Better Auth admin middleware could not be attached because no Express app is available.',
    )

    return
  }

  const adminPath = payload.config.routes?.admin ?? '/admin'

  app.use(createMiddleware(payload, adminPath))
}
