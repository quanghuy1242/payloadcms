import { DefaultTemplate } from '@payloadcms/next/templates'
import { Gutter } from '@payloadcms/ui'
import type { AdminViewServerProps } from 'payload'

import BookImportPage from './BookImportPage'

const BookImportAdminView = ({
  initPageResult,
  params,
  searchParams,
  viewActions,
}: AdminViewServerProps) => {
  return (
    <DefaultTemplate
      collectionSlug="books"
      i18n={initPageResult.req.i18n}
      locale={initPageResult.locale}
      params={params}
      payload={initPageResult.req.payload}
      permissions={initPageResult.permissions}
      req={initPageResult.req}
      searchParams={searchParams}
      user={initPageResult.req.user || undefined}
      viewActions={viewActions}
      viewType="list"
      visibleEntities={initPageResult.visibleEntities}
    >
      <Gutter>
        <BookImportPage />
      </Gutter>
    </DefaultTemplate>
  )
}

export default BookImportAdminView
