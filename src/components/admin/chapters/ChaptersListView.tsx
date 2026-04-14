'use client'

import {
  DefaultListView,
  ListSelection,
  useConfig,
  useListDrawerContext,
} from '@payloadcms/ui'
import type { ClientCollectionConfig, ListViewClientProps } from 'payload'
import { createPortal } from 'react-dom'
import { useEffect, useMemo, useState } from 'react'

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

type DrawerSelectionPortalProps = {
  collectionConfig: ClientCollectionConfig | null
  enabled: boolean
  label: string
  viewType: ListViewClientProps['viewType']
}

const DrawerSelectionPortal = ({
  collectionConfig,
  enabled,
  label,
  viewType,
}: DrawerSelectionPortalProps) => {
  const [headerActionsTarget, setHeaderActionsTarget] = useState<HTMLElement | null>(null)

  useEffect(() => {
    if (!enabled) {
      setHeaderActionsTarget(null)
      return undefined
    }

    const findTarget = (): boolean => {
      const nextTarget = document.querySelector('.list-drawer .list-header__actions')

      if (nextTarget instanceof HTMLElement) {
        setHeaderActionsTarget(nextTarget)
        return true
      }

      return false
    }

    if (findTarget()) {
      return undefined
    }

    const observer = new MutationObserver(() => {
      if (findTarget()) {
        observer.disconnect()
      }
    })

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    })

    return () => {
      observer.disconnect()
    }
  }, [enabled])

  if (!enabled || !collectionConfig || !headerActionsTarget) {
    return null
  }

  return createPortal(
    <ListSelection
      collectionConfig={collectionConfig}
      disableBulkDelete={false}
      disableBulkEdit={false}
      label={label}
      showSelectAllAcrossPages
      viewType={viewType}
    />,
    headerActionsTarget,
  )
}

const ChaptersListView = (props: ListViewClientProps) => {
  const { getEntityConfig } = useConfig()
  const { isInDrawer } = useListDrawerContext()

  const collectionConfig = useMemo(() => {
    const entityConfig = getEntityConfig({ collectionSlug: props.collectionSlug })

    if (!entityConfig || !('labels' in entityConfig)) {
      return null
    }

    return entityConfig as ClientCollectionConfig
  }, [getEntityConfig, props.collectionSlug])

  const selectionLabel = useMemo(() => {
    return resolvePluralLabel(collectionConfig?.labels?.plural, props.collectionSlug)
  }, [collectionConfig?.labels?.plural, props.collectionSlug])

  const beforeList = useMemo(() => {
    if (!props.BeforeList && !isInDrawer) {
      return undefined
    }

    return (
      <>
        {props.BeforeList}
        <DrawerSelectionPortal
          collectionConfig={collectionConfig}
          enabled={isInDrawer}
          label={selectionLabel}
          viewType={props.viewType}
        />
      </>
    )
  }, [collectionConfig, isInDrawer, props.BeforeList, props.viewType, selectionLabel])

  return <DefaultListView {...props} BeforeList={beforeList} />
}

export default ChaptersListView
