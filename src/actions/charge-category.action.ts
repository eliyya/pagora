'use server'

import { db } from '@/db/prisma'
import { ChargeCategorySchema, EditChargeCategorySchema } from '@/schemas/charge-category.schema'
import { getCurrentUserAction } from './users.action'
import { assertCardWritable, touchCardActivity } from '@/lib/card-access'
import { z } from 'zod'

export async function createChargeCategoryAction(
    data: z.infer<typeof ChargeCategorySchema>,
) {
    const user = await getCurrentUserAction()
    if (!user) return { error: 'unauthorized' as const }

    const parsed = ChargeCategorySchema.safeParse(data)
    if (!parsed.success) {
        return { error: 'validation error' as const }
    }

    try {
        await assertCardWritable(parsed.data.card_id, user.id)
    } catch {
        return { error: 'not found' as const }
    }

    const category = await db.$transaction(async (tx) => {
        const created = await tx.chargeCategory.upsert({
            where: {
                card_id_name: {
                    card_id: parsed.data.card_id,
                    name: parsed.data.name,
                },
            },
            update: {
                monthly_budget: parsed.data.monthly_budget,
            },
            create: parsed.data,
        })
        await touchCardActivity(parsed.data.card_id, tx)
        return created
    })

    return { data: category }
}

export async function updateChargeCategoryAction(
    id: string,
    data: z.infer<typeof EditChargeCategorySchema>,
) {
    const user = await getCurrentUserAction()
    if (!user) return { error: 'unauthorized' as const }

    const parsed = EditChargeCategorySchema.safeParse(data)
    if (!parsed.success) {
        return { error: 'validation error' as const }
    }

    const category = await db.chargeCategory.findFirst({ where: { id } })
    if (!category) return { error: 'not found' as const }

    try {
        await assertCardWritable(category.card_id, user.id)
    } catch {
        return { error: 'not found' as const }
    }

    const updated = await db.$transaction(async (tx) => {
        const result = await tx.chargeCategory.update({
            where: { id },
            data: parsed.data,
        })
        await touchCardActivity(category.card_id, tx)
        return result
    })

    return { data: updated }
}

export async function deleteChargeCategoryAction(id: string) {
    const user = await getCurrentUserAction()
    if (!user) return { error: 'unauthorized' as const }

    const category = await db.chargeCategory.findFirst({ where: { id } })
    if (!category) return { error: 'not found' as const }

    try {
        await assertCardWritable(category.card_id, user.id)
    } catch {
        return { error: 'not found' as const }
    }

    await db.$transaction(async (tx) => {
        await tx.chargeCategory.delete({ where: { id } })
        await touchCardActivity(category.card_id, tx)
    })

    return { data: { id } }
}
