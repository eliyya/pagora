import { db } from '@/db/prisma'
import { COOKIES } from '@/lib/constants'
import { getPublicKey } from '@/lib/envs'
import { jwtVerify } from 'jose'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
    const res = NextResponse.redirect(new URL('/auth/login', req.url))

    res.cookies.set(COOKIES.SESSION, '', { maxAge: 0, path: '/' })
    res.cookies.set(COOKIES.REFRESH, '', { maxAge: 0, path: '/' })

    const token = req.cookies.get(COOKIES.SESSION)?.value
    if (token) {
        const payload = await jwtVerify(token, await getPublicKey()).catch(
            () => null,
        )
        if (payload?.payload?.session_id) {
            await db.session.delete({
                where: { id: payload.payload.session_id as string },
            }).catch(() => {})
        }
    }

    return res
}
