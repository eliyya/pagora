import { jwtVerify } from 'jose'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { NODE_ENV, PUBLIC_KEY } from './lib/envs'
import { COOKIES } from './lib/constants'
import { db } from './db/prisma'
import { createJWT, generateRefreshToken, weakHash } from './lib/crypt'
import { Temporal } from 'temporal-polyfill'

export async function proxy(request: NextRequest) {
    const cookie = request.cookies.get(COOKIES.SESSION)?.value
    const refresh = request.cookies.get(COOKIES.REFRESH)?.value

    if (!cookie) {
        if (!refresh) {
            return NextResponse.redirect(new URL('/login', request.url))
        }
        return await refreshToken(request, refresh)
    }
    const jwtPayload = await jwtVerify(cookie, PUBLIC_KEY).catch(() => null)
    if (!jwtPayload) {
        if (!refresh) {
            return NextResponse.redirect(new URL('/login', request.url))
        }
        return await refreshToken(request, refresh)
    }
    return NextResponse.next()
}

export const config = {
    matcher: '/dashboard/:path*',
}

async function refreshToken(request: NextRequest, refresh: string) {
    const session = await db.session.findUnique({
        where: {
            refresh_token: weakHash(refresh),
        },
    })
    if (!session) {
        return NextResponse.redirect(new URL('/login', request.url))
    }
    if (session.expires_at.getTime() < Date.now()) {
        await db.session.delete({
            where: { id: session.id },
        })
        return NextResponse.redirect(new URL('/login', request.url))
    }
    const expires_at = new Date(
        Temporal.Now.instant().add({
            hours: 24 * 7,
        }).epochMilliseconds,
    )
    const refresh_token = generateRefreshToken()
    await db.session.update({
        where: { id: session.id },
        data: {
            refresh_token,
            expires_at,
        },
    })
    const jwt = await createJWT({
        sub: session.user_id,
        session_id: session.id,
    })
    const response = NextResponse.next()
    response.cookies.set(COOKIES.SESSION, jwt, {
        httpOnly: true,
        secure: NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 60_000 * 60,
    })
    response.cookies.set(COOKIES.REFRESH, refresh_token, {
        httpOnly: true,
        secure: NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 60_000 * 60,
    })
    return response
}
