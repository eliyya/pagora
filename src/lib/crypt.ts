import {
    randomBytes,
    createCipheriv,
    createDecipheriv,
    createHash,
} from 'node:crypto'
import { APP_URL, ENCRYPTION_KEY, getPrivateKey } from './envs'
import { SignJWT } from 'jose'

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

export function weakHash(raw: string) {
    return createHash('sha256').update(raw).digest('hex')
}

interface CreateJWTProps {
    sub: string
    session_id: string
}
export async function createJWT({ sub, session_id }: CreateJWTProps) {
    const jwt = await new SignJWT({
        session_id,
    })
        .setProtectedHeader({ alg: 'RS256' })
        .setIssuedAt()
        .setSubject(sub)
        .setIssuer(APP_URL)
        .setAudience('pagora')
        .setExpirationTime('1h')
        .sign(await getPrivateKey())
    return jwt
}
