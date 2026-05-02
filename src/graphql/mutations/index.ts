import { CreateBookmark } from './CreateBookmark'
import { CreateComment } from './CreateComment'
import { DeleteBookmark } from './DeleteBookmark'
import { DeleteComment } from './DeleteComment'
import { GenerateEpub } from './GenerateEpub'
import { SaveReadingProgress } from './SaveReadingProgress'
import { UnlockChapterPassword } from './UnlockChapterPassword'
import { UpdateComment } from './UpdateComment'
import { UpdateCommentStatus } from './UpdateCommentStatus'

export const mutations = (GraphQL: any, payload: any) => {
  return {
    unlockChapterPassword: UnlockChapterPassword(GraphQL, payload),
    saveReadingProgress: SaveReadingProgress(GraphQL, payload),
    createBookmark: CreateBookmark(GraphQL, payload),
    deleteBookmark: DeleteBookmark(GraphQL, payload),
    createComment: CreateComment(GraphQL, payload),
    updateComment: UpdateComment(GraphQL, payload),
    deleteComment: DeleteComment(GraphQL, payload),
    updateCommentStatus: UpdateCommentStatus(GraphQL, payload),
    generateEpub: GenerateEpub(GraphQL, payload),
  }
}
