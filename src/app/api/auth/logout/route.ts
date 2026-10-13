import { app } from '@/lib/routes'
import { APP_URL } from '@/lib/envs'
import { db } from '@/db/prisma'
import { COOKIES } from '@/lib/constants'
import { verifySessionJWT } from '@/lib/session-jwt'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
    const res = NextResponse.redirect(new URL(app.auth.login(), APP_URL))

    res.cookies.set(COOKIES.SESSION, '', { maxAge: 0, path: '/' })
    res.cookies.set(COOKIES.REFRESH, '', { maxAge: 0, path: '/' })

    const token = req.cookies.get(COOKIES.SESSION)?.value
    if (token) {
        const payload = await verifySessionJWT(token).catch(
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
