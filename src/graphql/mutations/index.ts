import { UnlockChapterPassword } from './UnlockChapterPassword'

export const mutations = (GraphQL: any, payload: any) => {
  return {
    unlockChapterPassword: UnlockChapterPassword(GraphQL, payload),
  }
}
