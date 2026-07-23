'use server'

import { db } from '@/db/prisma'
import { ChargeCategorySchema, EditChargeCategorySchema } from '@/schemas/charge-category.schema'
import { getCurrentUserAction } from './users.action'
import { assertCardWritable } from '@/lib/card-access'
import {
    beginCardChange,
    recordCardChanges,
    type CardChangeInput,
} from '@/lib/card-changes'
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
        const syncVersion = await beginCardChange(parsed.data.card_id, tx)
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
        await recordCardChanges(
            parsed.data.card_id,
            syncVersion,
            [
                {
                    entity: 'category',
                    entityId: created.id,
                    operation: 'upsert',
                },
            ],
            tx,
        )
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
        const syncVersion = await beginCardChange(category.card_id, tx)
        const current = await tx.chargeCategory.findUnique({ where: { id } })
        if (!current) throw new Error('category not found')

        const result = await tx.chargeCategory.update({
            where: { id },
            data: parsed.data,
        })
        const changes: CardChangeInput[] = [
            {
                entity: 'category',
                entityId: result.id,
                operation: 'upsert',
            },
        ]
        let affectedChargeIds: string[] = []
        if (current.name !== result.name) {
            const affectedCharges = await tx.charge.findMany({
                where: { category_id: id },
                select: { id: true },
            })
            affectedChargeIds = affectedCharges.map((charge) => charge.id)
            await tx.charge.updateMany({
                where: { category_id: id },
                data: { revision: syncVersion },
            })
            changes.push(
                ...affectedCharges.map((charge) => ({
                    entity: 'charge' as const,
                    entityId: charge.id,
                    operation: 'upsert' as const,
                })),
            )
        }
        await recordCardChanges(
            category.card_id,
            syncVersion,
            changes,
            tx,
        )
        return {
            category: result,
            affectedChargeIds,
            revision: syncVersion,
        }
    })

    return {
        data: updated.category,
        affectedChargeIds: updated.affectedChargeIds,
        revision: updated.revision,
    }
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

    const deleted = await db.$transaction(async (tx) => {
        const syncVersion = await beginCardChange(category.card_id, tx)
        const affectedCharges = await tx.charge.findMany({
            where: { category_id: id },
            select: { id: true },
        })
        await tx.charge.updateMany({
            where: { category_id: id },
            data: {
                category_id: null,
                revision: syncVersion,
            },
        })
        await tx.chargeCategory.delete({ where: { id } })
        await recordCardChanges(
            category.card_id,
            syncVersion,
            [
                {
                    entity: 'category',
                    entityId: id,
                    operation: 'delete',
                },
                ...affectedCharges.map((charge) => ({
                    entity: 'charge' as const,
                    entityId: charge.id,
                    operation: 'upsert' as const,
                })),
            ],
            tx,
        )
        return {
            affectedChargeIds: affectedCharges.map((charge) => charge.id),
            revision: syncVersion,
        }
    })

    return {
        data: { id },
        affectedChargeIds: deleted.affectedChargeIds,
        revision: deleted.revision,
    }
}
