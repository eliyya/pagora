import { createHash, randomBytes } from 'node:crypto'
import { SignJWT, jwtVerify } from 'jose'
import { APP_URL, getSessionKey } from './envs'

export const DISCORD_OAUTH_COOKIE = 'discord-oauth'
export const DISCORD_OAUTH_MAX_AGE = 600

export function codeChallenge(verifier: string) {
    return createHash('sha256').update(verifier).digest('base64url')
}

export async function createDiscordPKCE() {
    const verifier = randomBytes(32).toString('base64url')
    const state = randomBytes(32).toString('base64url')
    const cookie = await new SignJWT({ verifier, state })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setIssuer(APP_URL)
        .setAudience('discord-oauth')
        .setExpirationTime(`${DISCORD_OAUTH_MAX_AGE}s`)
        .sign(getSessionKey())
    return { state, challenge: codeChallenge(verifier), cookie }
}

export async function readDiscordVerifier(cookie: string | undefined, state: string | null) {
    if (!cookie || !state) return null
    try {
        const { payload } = await jwtVerify(cookie, getSessionKey(), {
            algorithms: ['HS256'], issuer: APP_URL, audience: 'discord-oauth',
        })
        if (payload.state !== state || typeof payload.verifier !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(payload.verifier)) return null
        return payload.verifier
    } catch {
        return null
    }
}
