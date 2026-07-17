'use server'
import { db } from '@/db/prisma'

type CreateShareQuotaInput = { user_id: string }

export async function createShareQuota(input: CreateShareQuotaInput) {
    return await db.share_quota.create({
        data: {
            user_id: input.user_id,
        },
    })
}
