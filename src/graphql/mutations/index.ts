import { CreateBookmark } from './CreateBookmark'
import { CreateComment } from './CreateComment'
import { DeleteBookmark } from './DeleteBookmark'
import { GenerateEpub } from './GenerateEpub'
import { SaveReadingProgress } from './SaveReadingProgress'
import { UnlockChapterPassword } from './UnlockChapterPassword'
import { UpdateCommentStatus } from './UpdateCommentStatus'

export const mutations = (GraphQL: any, payload: any) => {
  return {
    unlockChapterPassword: UnlockChapterPassword(GraphQL, payload),
    saveReadingProgress: SaveReadingProgress(GraphQL, payload),
    createBookmark: CreateBookmark(GraphQL, payload),
    deleteBookmark: DeleteBookmark(GraphQL, payload),
    createComment: CreateComment(GraphQL, payload),
    updateCommentStatus: UpdateCommentStatus(GraphQL, payload),
    generateEpub: GenerateEpub(GraphQL, payload),
  }
}
