import crypto from 'node:crypto'

const VERIFIER_BYTE_LENGTH = 64

const sha256 = (value: string): Buffer => {
  return crypto.createHash('sha256').update(value).digest()
}

export const createPkcePair = async (): Promise<{ verifier: string; challenge: string }> => {
  const verifier = crypto.randomBytes(VERIFIER_BYTE_LENGTH).toString('base64url')
  const digest = sha256(verifier)
  const challenge = digest.toString('base64url')

  return {
    verifier,
    challenge,
  }
}
