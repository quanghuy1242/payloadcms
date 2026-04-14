import config from '@payload-config'
import { redirect } from 'next/navigation'
import { formatAdminURL } from 'payload/shared'

export default async function BooksCreateRoute() {
  const resolvedConfig = await config

  redirect(
    formatAdminURL({
      adminRoute: resolvedConfig.routes.admin,
      path: '/collections/books/import',
    }),
  )
}