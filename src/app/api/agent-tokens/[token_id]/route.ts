import { getCurrentUserAction } from '@/actions/users.action'
import { db } from '@/db/prisma'
import type { AgentTokenRecord } from '@/lib/agent-tokens'

export async function DELETE(
    _request: Request,
    { params }: { params: Promise<{ token_id: string }> },
) {
    const user = await getCurrentUserAction()
    if (!user) {
        return Response.json({ error: 'unauthorized' }, { status: 401 })
    }

    const { token_id } = await params
    const rows = await db.$queryRaw<AgentTokenRecord[]>`
        UPDATE agent_tokens
        SET revoked_at = COALESCE(revoked_at, NOW()), updated_at = NOW()
        WHERE id = ${token_id}
          AND user_id = ${user.id}
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

    if (!rows[0]) {
        return Response.json({ error: 'not found' }, { status: 404 })
    }

    return Response.json({
        data: {
            id: rows[0].id,
            revoked_at: rows[0].revoked_at,
        },
    })
}
