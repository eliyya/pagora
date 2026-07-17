import { getCurrentUserAction } from '@/actions/users.action'
import { Prisma } from '@/db/generated/prisma/client'
import { db } from '@/db/prisma'
import {
    generateAgentToken,
    hashAgentToken,
    normalizeAgentScopes,
    type AgentTokenRecord,
} from '@/lib/agent-tokens'
import { NextRequest } from 'next/server'

function serializeToken(token: AgentTokenRecord) {
    return {
        id: token.id,
        name: token.name,
        scopes: token.scopes,
        last_used_at: token.last_used_at,
        expires_at: token.expires_at,
        revoked_at: token.revoked_at,
        created_at: token.created_at,
        updated_at: token.updated_at,
    }
}

export async function GET() {
    const user = await getCurrentUserAction()
    if (!user) {
        return Response.json({ error: 'unauthorized' }, { status: 401 })
    }

    const tokens = await db.$queryRaw<AgentTokenRecord[]>`
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
        WHERE user_id = ${user.id}
        ORDER BY created_at DESC
    `

    return Response.json({ data: tokens.map(serializeToken) })
}

export async function POST(request: NextRequest) {
    const user = await getCurrentUserAction()
    if (!user) {
        return Response.json({ error: 'unauthorized' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const name =
        typeof body.name === 'string' && body.name.trim().length > 0
            ? body.name.trim()
            : 'Agent token'
    const scopes = normalizeAgentScopes(body.scopes)
    const expiresAt =
        typeof body.expires_at === 'string' && body.expires_at.length > 0
            ? new Date(body.expires_at)
            : null

    if (expiresAt && Number.isNaN(expiresAt.getTime())) {
        return Response.json(
            { error: 'expires_at must be a valid ISO date string' },
            { status: 400 },
        )
    }

    if (scopes.length === 0) {
        return Response.json(
            { error: 'at least one valid scope is required' },
            { status: 400 },
        )
    }

    const token = generateAgentToken()
    const tokenHash = hashAgentToken(token)

    const rows = await db.$queryRaw<AgentTokenRecord[]>`
        INSERT INTO agent_tokens (
            user_id,
            name,
            token_hash,
            scopes,
            expires_at,
            updated_at
        )
        VALUES (
            ${user.id},
            ${name},
            ${tokenHash},
            ARRAY[${Prisma.join(scopes)}]::TEXT[],
            ${expiresAt},
            NOW()
        )
        RETURNING
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
    `

    return Response.json(
        {
            data: {
                ...serializeToken(rows[0]),
                token,
            },
        },
        { status: 201 },
    )
}
