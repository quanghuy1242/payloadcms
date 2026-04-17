/** Describes a single chapter import failure captured during an EPUB import run. */
export type EpubFailureRecord = {
  chapterIndex: number
  chapterTitle: string
  error: string
  timestamp: string
}

/** Ordered list of all chapter failures recorded during a single EPUB import run. */
export type EpubFailureLog = EpubFailureRecord[]
