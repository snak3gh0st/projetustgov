import 'server-only'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'
import { getContaAzulConfig } from './config'

function keyBytes() {
  const { encryptionKey } = getContaAzulConfig()
  // Accept base64 32-byte key or derive from any string via SHA-256
  try {
    const raw = Buffer.from(encryptionKey, 'base64')
    if (raw.length === 32) return raw
  } catch {
    // fall through
  }
  return createHash('sha256').update(encryptionKey).digest()
}

/** Encrypt plaintext token. Format: iv:authTag:ciphertext (hex). */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', keyBytes(), iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
}

export function decryptSecret(payload: string): string {
  const [ivHex, tagHex, dataHex] = payload.split(':')
  if (!ivHex || !tagHex || !dataHex) {
    throw new Error('Invalid encrypted payload')
  }
  const decipher = createDecipheriv('aes-256-gcm', keyBytes(), Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ])
  return decrypted.toString('utf8')
}
