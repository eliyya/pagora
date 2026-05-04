'use server'

import { cookies } from 'next/headers'
import { jwtVerify } from 'jose'
import { db } from '@/db/prisma'
import { PUBLIC_KEY } from '@/lib/envs'

export async function getCurrentUser() {
    try {
        const cookieStore = await cookies()
        const token = cookieStore.get('auth_token')?.value

        if (!token) {
            return null
        }

        const { payload } = await jwtVerify(token, PUBLIC_KEY)

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
