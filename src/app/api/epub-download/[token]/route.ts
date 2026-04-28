import { NextRequest, NextResponse } from 'next/server'

import { getPayload } from 'payload'

import config from '@payload-config'

import type { SerializedEditorState, SerializedLexicalNode } from 'lexical'

import type { Options } from 'epub-gen-memory'

import { getEpubExportBaseURL, verifyEpubDownloadToken } from '@/utils/epubExport'
import { normalizeEntityId } from '@/utils/identifiers'
import { collectUploadIdsFromLexicalState, lexicalToHtml } from '@/utils/lexicalToHtml'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params

  const tokenData = verifyEpubDownloadToken(token)

  if (!tokenData) {
    return new NextResponse('Invalid or expired download token', { status: 403 })
  }

  const payload = await getPayload({ config })

  const book = await payload.findByID({
    collection: 'books',
    id: Number(tokenData.bookId),
    depth: 0,
    overrideAccess: true,
  })

  if (!book) {
    return new NextResponse('Book not found', { status: 404 })
  }

  const bookCreatedBy = normalizeEntityId((book as unknown as Record<string, unknown>).createdBy)
  const tokenUserId = normalizeEntityId(tokenData.userId)

  if (bookCreatedBy == null || tokenUserId == null || String(bookCreatedBy) !== String(tokenUserId)) {
    return new NextResponse('Download token does not match book owner', { status: 403 })
  }

  const bookTitle = (book as unknown as Record<string, unknown>).title as string
  const bookAuthor = (book as unknown as Record<string, unknown>).author as string | undefined
  const bookDescription = (book as unknown as Record<string, unknown>).description as string | undefined
  const bookPublisher = (book as unknown as Record<string, unknown>).publisher as string | undefined
  const bookLanguage = (book as unknown as Record<string, unknown>).language as string | undefined
  const bookSlug = (book as unknown as Record<string, unknown>).slug as string

  const chapters = await payload.find({
    collection: 'chapters',
    where: {
      book: {
        equals: Number(tokenData.bookId),
      },
    },
    sort: 'order',
    limit: 1000,
    depth: 1,
    overrideAccess: true,
  })

  const mediaIds = Array.from(
    new Set(
      chapters.docs.flatMap((chapter) => {
        const content = (chapter as unknown as Record<string, unknown>).content as SerializedEditorState<SerializedLexicalNode> | undefined

        if (!content || typeof content !== 'object' || !content.root) {
          return []
        }

        return collectUploadIdsFromLexicalState(content)
      }),
    ),
  )

  const mediaById = new Map<string, Record<string, unknown>>()

  if (mediaIds.length > 0) {
    const media = await payload.find({
      collection: 'media',
      where: {
        id: {
          in: mediaIds,
        },
      },
      limit: mediaIds.length,
      depth: 0,
      overrideAccess: true,
    })

    for (const doc of media.docs) {
      const mediaId = normalizeEntityId((doc as { id?: unknown }).id)

      if (mediaId != null) {
        mediaById.set(String(mediaId), doc as unknown as Record<string, unknown>)
      }
    }
  }

  const epubGenModule = await import('epub-gen-memory')
  const epubGen = epubGenModule.default
  const baseUrl = getEpubExportBaseURL(request.nextUrl.origin)

  const epubChapters = chapters.docs.map((chapter) => {
    const content = (chapter as unknown as Record<string, unknown>).content as SerializedEditorState<SerializedLexicalNode> | undefined
    const title = (chapter as unknown as Record<string, unknown>).title as string

    let htmlContent = ''
    if (content && typeof content === 'object' && content.root) {
      htmlContent = lexicalToHtml(content, {
        baseUrl,
        mediaById,
      })
    }

    return {
      title,
      content: `<html><body>${htmlContent}</body></html>`,
    }
  })

  const epubOptions: Options = {
    title: bookTitle,
    tocTitle: 'Table of Contents',
    prependChapterTitles: true,
    numberChaptersInTOC: true,
  }

  if (bookAuthor) {
    epubOptions.author = bookAuthor
  }
  if (bookDescription) {
    epubOptions.description = bookDescription
  }
  if (bookPublisher) {
    epubOptions.publisher = bookPublisher
  }
  if (bookLanguage) {
    epubOptions.lang = bookLanguage
  }

  const epubBuffer = await epubGen(epubOptions, epubChapters)

  const filename = `${bookSlug}.epub`

  return new NextResponse(new Uint8Array(epubBuffer), {
    headers: {
      'Cache-Control': 'private, no-store, max-age=0',
      'Content-Type': 'application/epub+zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  })
}
