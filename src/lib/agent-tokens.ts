import { randomBytes, timingSafeEqual } from 'node:crypto'
import { db } from '@/db/prisma'
import { weakHash } from './crypt'

export const AGENT_TOKEN_PREFIX = 'pagora'

export const AGENT_SCOPES = [
    'cards:read',
    'charges:read',
    'charges:write',
    'payments:write',
] as const

export type AgentScope = (typeof AGENT_SCOPES)[number]

export interface AgentTokenRecord {
    id: string
    user_id: string
    name: string
    token_hash: string
    scopes: string[]
    last_used_at: Date | null
    expires_at: Date | null
    revoked_at: Date | null
    created_at: Date
    updated_at: Date
}

export function generateAgentToken() {
    return `${AGENT_TOKEN_PREFIX}_${randomBytes(32).toString('base64url')}`
}

export function hashAgentToken(token: string) {
    return weakHash(token)
}

export function normalizeAgentScopes(scopes: unknown): AgentScope[] {
    if (!Array.isArray(scopes) || scopes.length === 0) {
        return [...AGENT_SCOPES]
    }
    const unique = Array.from(new Set(scopes))
    return unique.filter((scope): scope is AgentScope =>
        AGENT_SCOPES.includes(scope as AgentScope),
    )
}

export function hasAgentScope(token: AgentTokenRecord, scope: AgentScope) {
    return token.scopes.includes(scope)
}

export function assertAgentScope(token: AgentTokenRecord, scope: AgentScope) {
    if (!hasAgentScope(token, scope)) {
        throw new AgentAuthError(
            `Token does not include required scope: ${scope}`,
            403,
            scope,
        )
    }
}

export class AgentAuthError extends Error {
    constructor(
        message: string,
        readonly status = 401,
        readonly requiredScope?: AgentScope,
    ) {
        super(message)
        this.name = 'AgentAuthError'
    }
}

export function getBearerToken(request: Request) {
    const header = request.headers.get('authorization')
    if (!header) return null
    const [scheme, token] = header.split(' ')
    if (scheme?.toLowerCase() !== 'bearer' || !token) return null
    return token
}

export async function getAgentTokenFromRequest(request: Request) {
    const rawToken = getBearerToken(request)
    if (!rawToken) {
        throw new AgentAuthError('Missing bearer token')
    }

    const tokenHash = hashAgentToken(rawToken)
    const rows = await db.$queryRaw<AgentTokenRecord[]>`
        SELECT
            id,
            user_id,
            name,
            token_hash,
            scopes,
            last_used_at,
            expires_at,
            revoked_at,
            created_at,
            updated_at
        FROM agent_tokens
        WHERE token_hash = ${tokenHash}
        LIMIT 1
    `

    const token = rows[0]
    if (!token) {
        throw new AgentAuthError('Invalid bearer token')
    }

    const expected = Buffer.from(token.token_hash, 'hex')
    const actual = Buffer.from(tokenHash, 'hex')
    if (
        expected.length !== actual.length ||
        !timingSafeEqual(expected, actual)
    ) {
        throw new AgentAuthError('Invalid bearer token')
    }

    if (token.revoked_at) {
        throw new AgentAuthError('Bearer token has been revoked')
    }

    if (token.expires_at && token.expires_at.getTime() <= Date.now()) {
        throw new AgentAuthError('Bearer token has expired')
    }

    await db.$executeRaw`
        UPDATE agent_tokens
        SET last_used_at = NOW(), updated_at = NOW()
        WHERE id = ${token.id}
    `

    return token
}

export function agentUnauthorizedResponse(error: AgentAuthError, request: Request) {
    const metadataUrl = new URL(
        '/.well-known/oauth-protected-resource',
        request.url,
    )
    const headers = new Headers({
        'WWW-Authenticate': `Bearer resource_metadata="${metadataUrl.toString()}"${
            error.requiredScope ? `, scope="${error.requiredScope}"` : ''
        }`,
    })

    return Response.json(
        {
            error: error.status === 403 ? 'insufficient_scope' : 'unauthorized',
            message: error.message,
        },
        { status: error.status, headers },
    )
}
