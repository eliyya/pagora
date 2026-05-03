import { jwtVerify } from 'jose'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { PUBLIC_KEY } from './lib/envs'

// This function can be marked `async` if using `await` inside
export async function proxy(request: NextRequest) {
    const cookie = request.cookies.get('session')?.value
    if (!cookie) {
        return NextResponse.redirect(new URL('/login', request.url))
    }
    const jwtPayload = await jwtVerify<{
        id: string
        iat: number
    }>(cookie, PUBLIC_KEY).catch(() => null)
    if (!jwtPayload) {
        return NextResponse.redirect(new URL('/login', request.url))
    }
    return NextResponse.next()
}

export const config = {
    matcher: '/dashboard/:path*',
}
