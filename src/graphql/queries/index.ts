import { BookExportChunk } from './BookExportChunk'
import { BookExportManifest } from './BookExportManifest'
import { Bookmarks } from './Bookmarks'
import { PreviewToken } from './PreviewToken'
import { ReadingProgress } from './ReadingProgress'
import { SimilarPosts } from './SimilarPosts'

export const queries = (GraphQL: any, payload: any) => {
  return {
    SimilarPosts: SimilarPosts(GraphQL, payload),
    previewToken: PreviewToken(GraphQL, payload),
    readingProgress: ReadingProgress(GraphQL, payload),
    bookmarks: Bookmarks(GraphQL, payload),
    bookExportManifest: BookExportManifest(GraphQL, payload),
    bookExportChunk: BookExportChunk(GraphQL, payload),
  }
}
