import { randomBytes, createCipheriv, createDecipheriv } from 'crypto'
import { ENCRYPTION_KEY } from './envs'

const ALGORITHM = 'aes-256-gcm'
const KEY = Buffer.from(ENCRYPTION_KEY, 'hex')
const IV_LENGTH = 12

export function encrypt(text: string) {
    const iv = randomBytes(IV_LENGTH)
    const cipher = createCipheriv(ALGORITHM, KEY, iv)

    const encrypted = Buffer.concat([
        cipher.update(text, 'utf8'),
        cipher.final(),
    ])

    const authTag = cipher.getAuthTag()

    return Buffer.concat([iv, authTag, encrypted]).toString('base64')
}

export function decrypt(payload: string) {
    const data = Buffer.from(payload, 'base64')

    const iv = data.subarray(0, IV_LENGTH)
    const authTag = data.subarray(IV_LENGTH, IV_LENGTH + 16)
    const encrypted = data.subarray(IV_LENGTH + 16)

    const decipher = createDecipheriv(ALGORITHM, KEY, iv)
    decipher.setAuthTag(authTag)

    const decrypted = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
    ])

    return decrypted.toString('utf8')
}

export function generateRefreshToken() {
    return randomBytes(32).toString('base64url')
}
