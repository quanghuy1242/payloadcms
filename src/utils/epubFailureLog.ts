export type EpubFailureRecord = {
  order: number
  reason: string
  timestamp: string
}

export type EpubFailureLog = EpubFailureRecord[]
