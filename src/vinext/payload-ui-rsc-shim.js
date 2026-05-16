import { jsx as _jsx } from 'react/jsx-runtime'

import { HtmlDiff } from '../../node_modules/@payloadcms/ui/dist/elements/HTMLDiff/diff/index.js'

export { FieldDiffContainer } from '../../node_modules/@payloadcms/ui/dist/elements/FieldDiffContainer/index.js'
export { FieldDiffLabel } from '../../node_modules/@payloadcms/ui/dist/elements/FieldDiffLabel/index.js'
export { FolderTableCell } from '../../node_modules/@payloadcms/ui/dist/elements/FolderView/Cell/index.server.js'
export { FolderField } from '../../node_modules/@payloadcms/ui/dist/elements/FolderView/FolderField/index.server.js'
export { _internal_renderFieldHandler } from '../../node_modules/@payloadcms/ui/dist/forms/fieldSchemasToFormState/serverFunctions/renderFieldServerFn.js'
export { File } from '../../node_modules/@payloadcms/ui/dist/graphics/File/index.js'
export { CheckIcon } from '../../node_modules/@payloadcms/ui/dist/icons/Check/index.js'
export { copyDataFromLocaleHandler } from '../../node_modules/@payloadcms/ui/dist/utilities/copyDataFromLocale.js'
export { getColumns } from '../../node_modules/@payloadcms/ui/dist/utilities/getColumns.js'
export { getFolderResultsComponentAndData } from '../../node_modules/@payloadcms/ui/dist/utilities/getFolderResultsComponentAndData.js'
export { handleLivePreview } from '../../node_modules/@payloadcms/ui/dist/utilities/handleLivePreview.js'
export { renderFilters, renderTable } from '../../node_modules/@payloadcms/ui/dist/utilities/renderTable.js'
export { resolveFilterOptions } from '../../node_modules/@payloadcms/ui/dist/utilities/resolveFilterOptions.js'
export { upsertPreferences } from '../../node_modules/@payloadcms/ui/dist/utilities/upsertPreferences.js'

export const getHTMLDiffComponents = ({ fromHTML, toHTML, tokenizeByCharacter }) => {
  const diffHTML = new HtmlDiff(fromHTML, toHTML, {
    tokenizeByCharacter,
  })

  const [oldHTML, newHTML] = diffHTML.getSideBySideContents()

  return {
    From: oldHTML
      ? _jsx('div', {
          className: 'html-diff__diff-old html-diff',
          dangerouslySetInnerHTML: { __html: oldHTML },
        })
      : null,
    To: newHTML
      ? _jsx('div', {
          className: 'html-diff__diff-new html-diff',
          dangerouslySetInnerHTML: { __html: newHTML },
        })
      : null,
  }
}
