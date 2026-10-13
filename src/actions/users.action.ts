'use server'

import { cookies } from 'next/headers'
import { verifySessionJWT } from '@/lib/session-jwt'
import { db } from '@/db/prisma'
import { COOKIES } from '@/lib/constants'

export async function getCurrentUserAction() {
    try {
        const cookieStore = await cookies()
        const token = cookieStore.get(COOKIES.SESSION)?.value

        if (!token) {
            return null
        }

        const { payload } = await verifySessionJWT(token)

        if (!payload.sub) {
            return null
        }

        return await db.user.findUnique({
            where: { id: payload.sub },
        })
    } catch {
        return null
    }
}
