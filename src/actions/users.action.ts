'use server'

import { cookies } from 'next/headers'
import { jwtVerify } from 'jose'
import { db } from '@/db/prisma'
import { getPublicKey } from '@/lib/envs'
import { COOKIES } from '@/lib/constants'

export async function getCurrentUserAction() {
    try {
        const cookieStore = await cookies()
        const token = cookieStore.get(COOKIES.SESSION)?.value

        if (!token) {
            return null
        }

        const { payload } = await jwtVerify(token, await getPublicKey())

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
