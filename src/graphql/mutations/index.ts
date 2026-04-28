import { CreateBookmark } from './CreateBookmark'
import { DeleteBookmark } from './DeleteBookmark'
import { GenerateEpub } from './GenerateEpub'
import { SaveReadingProgress } from './SaveReadingProgress'
import { UnlockChapterPassword } from './UnlockChapterPassword'

export const mutations = (GraphQL: any, payload: any) => {
  return {
    unlockChapterPassword: UnlockChapterPassword(GraphQL, payload),
    saveReadingProgress: SaveReadingProgress(GraphQL, payload),
    createBookmark: CreateBookmark(GraphQL, payload),
    deleteBookmark: DeleteBookmark(GraphQL, payload),
    generateEpub: GenerateEpub(GraphQL, payload),
  }
}
