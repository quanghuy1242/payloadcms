'use client'

import {
  DefaultListView,
  ListSelection,
  useConfig,
  useListDrawerContext,
} from '@payloadcms/ui'
import type { ListViewClientProps } from 'payload'
import { useMemo } from 'react'

const resolvePluralLabel = (label: unknown, fallback: string): string => {
  if (typeof label === 'string' && label.trim().length > 0) {
    return label
  }

  if (label && typeof label === 'object') {
    const firstLabel = Object.values(label as Record<string, unknown>).find((value): value is string => {
      return typeof value === 'string' && value.trim().length > 0
    })

    if (firstLabel) {
      return firstLabel
    }
  }

  return fallback
}

const ChaptersListView = (props: ListViewClientProps) => {
  const { getEntityConfig } = useConfig()
  const { isInDrawer } = useListDrawerContext()

  const collectionConfig = useMemo(() => {
    return getEntityConfig({ collectionSlug: props.collectionSlug })
  }, [getEntityConfig, props.collectionSlug])

  const selectionLabel = useMemo(() => {
    return resolvePluralLabel(collectionConfig?.labels?.plural, props.collectionSlug)
  }, [collectionConfig?.labels?.plural, props.collectionSlug])

  const drawerBulkActions = useMemo(() => {
    if (!isInDrawer || !collectionConfig) {
      return null
    }

    return (
      <div className="chapters-list-view__bulk-actions">
        <ListSelection
          collectionConfig={collectionConfig}
          disableBulkDelete={false}
          disableBulkEdit={false}
          label={selectionLabel}
          showSelectAllAcrossPages
          viewType={props.viewType}
        />
      </div>
    )
  }, [collectionConfig, isInDrawer, props.viewType, selectionLabel])

  const beforeList = useMemo(() => {
    if (!props.BeforeList && !drawerBulkActions) {
      return undefined
    }

    return (
      <>
        {props.BeforeList}
        {drawerBulkActions}
      </>
    )
  }, [drawerBulkActions, props.BeforeList])

  return <DefaultListView {...props} BeforeList={beforeList} />
}

export default ChaptersListView
