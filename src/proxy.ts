import { jwtVerify } from 'jose'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { getPublicKey, NODE_ENV } from './lib/envs'
import { COOKIES, REDIRECT_PATH } from './lib/constants'
import { db } from './db/prisma'
import { createJWT, generateRefreshToken, weakHash } from './lib/crypt'
import { Temporal } from 'temporal-polyfill'

export async function proxy(request: NextRequest) {
    const cookie = request.cookies.get(COOKIES.SESSION)?.value
    const refresh = request.cookies.get(COOKIES.REFRESH)?.value

    if (!cookie) {
        if (!refresh) {
            return authenticationFailure(request)
        }
        return await refreshToken(request, refresh)
    }
    const jwtPayload = await jwtVerify(cookie, await getPublicKey()).catch(
        () => null,
    )

    if (!jwtPayload) {
        if (!refresh) {
            return authenticationFailure(request)
        }
        return await refreshToken(request, refresh)
    }
    return NextResponse.next()
}

export const config = {
    matcher: ['/dashboard/:path*', '/api/cards/:cardId/sync'],
}

function authenticationFailure(request: NextRequest) {
    if (request.nextUrl.pathname.startsWith('/api/cards/')) {
        return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
    }
    return NextResponse.redirect(new URL(REDIRECT_PATH, request.url))
}

async function refreshToken(request: NextRequest, refresh: string) {
    const currentRefreshHash = weakHash(refresh)
    const session = await db.session.findUnique({
        where: {
            refresh_token: currentRefreshHash,
        },
    })
    if (!session) {
        return authenticationFailure(request)
    }
    if (session.expires_at.getTime() < Date.now()) {
        await db.session.deleteMany({
            where: { id: session.id },
        })
        return authenticationFailure(request)
    }
    const expires_at = new Date(
        Temporal.Now.instant().add({
            hours: 24 * 7,
        }).epochMilliseconds,
    )
    const refresh_token = generateRefreshToken()
    const rotated = await db.session.updateMany({
        where: {
            id: session.id,
            refresh_token: currentRefreshHash,
        },
        data: {
            refresh_token: weakHash(refresh_token),
            expires_at,
        },
    })
    if (rotated.count !== 1) return authenticationFailure(request)
    const jwt = await createJWT({
        sub: session.user_id,
        session_id: session.id,
    })
    request.cookies.set(COOKIES.SESSION, jwt)
    request.cookies.set(COOKIES.REFRESH, refresh_token)
    const response = NextResponse.next({
        request: { headers: request.headers },
    })
    response.cookies.set(COOKIES.SESSION, jwt, {
        httpOnly: true,
        secure: NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60,
    })
    response.cookies.set(COOKIES.REFRESH, refresh_token, {
        httpOnly: true,
        secure: NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7,
    })
    return response
}
