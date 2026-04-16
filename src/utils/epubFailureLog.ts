export type EpubFailureRecord = {
  chapterIndex: number
  chapterTitle: string
  error: string
  timestamp: string
}

export type EpubFailureLog = EpubFailureRecord[]
