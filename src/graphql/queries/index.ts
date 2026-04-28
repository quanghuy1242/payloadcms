import { Bookmarks } from './Bookmarks'
import { ReadingProgress } from './ReadingProgress'
import { SimilarPosts } from './SimilarPosts'

export const queries = (GraphQL: any, payload: any) => {
  return {
    SimilarPosts: SimilarPosts(GraphQL, payload),
    readingProgress: ReadingProgress(GraphQL, payload),
    bookmarks: Bookmarks(GraphQL, payload),
  }
}
