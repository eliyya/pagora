import { getCurrentUserAction } from '@/actions/users.action'
import {
    parsePushCardMutationsRequest,
    pushCardMutations,
} from '@/lib/card-mutations'
import { getCardSync } from '@/lib/card-sync'

const PRIVATE_NO_STORE_HEADERS = {
    'Cache-Control': 'private, no-store',
    Vary: 'Cookie',
}

function authenticatedSyncHeaders(userId: string) {
    return {
        ...PRIVATE_NO_STORE_HEADERS,
        'X-Sync-User': userId,
    }
}

export async function GET(
    request: Request,
    context: { params: Promise<{ card_id: string }> },
) {
    const user = await getCurrentUserAction()
    if (!user) {
        return Response.json(
            { error: 'unauthorized' },
            { status: 401, headers: PRIVATE_NO_STORE_HEADERS },
        )
    }

    const rawCursor = new URL(request.url).searchParams.get('cursor')
    const responseHeaders = authenticatedSyncHeaders(user.id)
    if (rawCursor !== null && !/^\d+$/.test(rawCursor)) {
        return Response.json(
            { error: 'invalid cursor' },
            { status: 400, headers: responseHeaders },
        )
    }

    const cursor = rawCursor === null ? null : Number(rawCursor)
    if (cursor !== null && !Number.isSafeInteger(cursor)) {
        return Response.json(
            { error: 'invalid cursor' },
            { status: 400, headers: responseHeaders },
        )
    }

    const { card_id: cardId } = await context.params
    const result = await getCardSync(cardId, user.id, cursor)

    if (result.status === 'not-found') {
        return Response.json(
            { error: 'card not found' },
            { status: 404, headers: responseHeaders },
        )
    }

    if (result.status === 'unchanged') {
        return new Response(null, {
            status: 204,
            headers: {
                ...responseHeaders,
                'X-Sync-Cursor': String(result.cursor),
                'X-Card-Access': result.access,
            },
        })
    }

    return Response.json(result.data, {
        headers: {
            ...responseHeaders,
            'X-Card-Access': result.data.access,
        },
    })
}

export async function POST(
    request: Request,
    context: { params: Promise<{ card_id: string }> },
) {
    const user = await getCurrentUserAction()
    if (!user) {
        return Response.json(
            { error: 'unauthorized' },
            { status: 401, headers: PRIVATE_NO_STORE_HEADERS },
        )
    }

    const responseHeaders = authenticatedSyncHeaders(user.id)
    if (request.headers.get('X-Expected-Sync-User') !== user.id) {
        return Response.json(
            { error: 'signed-in user changed' },
            { status: 409, headers: responseHeaders },
        )
    }

    const body = await request.json().catch(() => null)
    const parsed = parsePushCardMutationsRequest(body)
    if (!parsed.success) {
        return Response.json(
            { error: 'invalid mutations' },
            { status: 400, headers: responseHeaders },
        )
    }

    const { card_id: cardId } = await context.params
    const result = await pushCardMutations(
        cardId,
        user.id,
        parsed.data,
    )
    if (result.status === 'not-found') {
        return Response.json(
            { error: 'card not found' },
            { status: 404, headers: responseHeaders },
        )
    }
    if (result.status === 'forbidden') {
        return Response.json(
            { error: 'write access required' },
            { status: 403, headers: responseHeaders },
        )
    }

    return Response.json(result.data, {
        headers: responseHeaders,
    })
}
