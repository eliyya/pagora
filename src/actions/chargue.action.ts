'use server'

import { db } from '@/db/prisma'
import {
    CreateChargeSchema,
    CreateCharge,
    DEFAULT_CREATE_CHARGE_VALUE,
} from '@/schemas/charge'
import { EditChargeSchema } from '@/schemas/edit-charge.schema'
import z from 'zod'
import { getCurrentUserAction } from './users.action'
import { Charge, ChargeCategory } from '@/db/generated/prisma/browser'
import { assertCardWritable, touchCardActivity } from '@/lib/card-access'
import type { Prisma } from '@/db/generated/prisma/client'

type ChargeWithCategory = Charge & {
    category: ChargeCategory | null
}

interface CreateChargueProps extends CreateCharge {
    card_id: string
}

async function resolveCategoryId(
    tx: Prisma.TransactionClient,
    card_id: string,
    categoryName?: string,
) {
    const name = categoryName?.trim()
    if (!name) return null

    const category = await tx.chargeCategory.upsert({
        where: {
            card_id_name: {
                card_id,
                name,
            },
        },
        update: {},
        create: {
            card_id,
            name,
        },
    })

    return category.id
}

export async function createChargue(data: CreateChargueProps) {
    const user = await getCurrentUserAction()
    if (!user) {
        throw new Error('unauthorized')
    }
    const parsed = CreateChargeSchema.safeParse(data)
    if (!parsed.success) {
        throw new Error('invalid charge')
    }
    await assertCardWritable(parsed.data.card_id, user.id)
    const charge = await db.$transaction(async (tx) => {
        const category_id = await resolveCategoryId(
            tx,
            parsed.data.card_id,
            parsed.data.category_name,
        )
        const created = await tx.charge.create({
            data: {
                card_id: parsed.data.card_id,
                name: parsed.data.name,
                amount: parsed.data.amount,
                category_id,
            },
            include: { category: true },
        })
        await touchCardActivity(parsed.data.card_id, tx)
        return created
    })
    return charge
}

interface CreateChargueState {
    fields: CreateCharge
    errors?: ReturnType<typeof z.flattenError<CreateCharge>>['fieldErrors']
    done?: Charge
}
export async function createChargueFormAction(
    state: CreateChargueState,
    formData: FormData,
): Promise<CreateChargueState> {
    const formObject = Object.fromEntries(formData)
    const parsed = CreateChargeSchema.safeParse(formObject)
    if (!parsed.success) {
        const errors = z.flattenError(parsed.error)
        return {
            fields: state.fields,
            errors: errors.fieldErrors,
        }
    }

    const charge = await createChargue(parsed.data)

    return {
        fields: DEFAULT_CREATE_CHARGE_VALUE,
        done: charge,
    }
}

export async function batchPayChargesAction(card_id: string, amount: number) {
    const user = await getCurrentUserAction()
    if (!user) {
        return { error: 'unauthorized' as const }
    }
    try {
        await assertCardWritable(card_id, user.id)
    } catch {
        return { error: 'not found' as const }
    }
    const { updated, payments } = await db.$transaction(async (tx) => {
        const all = await tx.charge.findMany({
            where: { card_id },
            orderBy: { created_at: 'asc' },
        })
        const updated: ChargeWithCategory[] = []
        const payments: Array<{
            chargeId: string
            amount: number
            chargeDate: Date
        }> = []
        let remaining = amount
        for (const charge of all) {
            if (remaining <= 0) break
            const owed = charge.amount - charge.paid
            if (owed <= 0) continue
            const pay = Math.min(owed, remaining)
            remaining -= pay
            const newCharge = await tx.charge.update({
                where: { id: charge.id },
                data: { paid: charge.paid + pay },
                include: { category: true },
            })
            await tx.paymentLog.create({
                data: {
                    charge_id: charge.id,
                    amount: pay,
                    status: 'success',
                },
            })
            payments.push({
                chargeId: charge.id,
                amount: pay,
                chargeDate: charge.created_at,
            })
            updated.push(newCharge)
        }
        if (updated.length > 0) {
            await touchCardActivity(card_id, tx)
        }
        return { updated, payments }
    })
    return { data: updated, payments }
}

export async function paidChargeAction(id: string) {
    const user = await getCurrentUserAction()
    if (!user) {
        return {
            error: 'unauthorized' as const,
        }
    }
    const charge = await db.charge.findFirst({
        where: {
            id,
        },
        include: { card: true },
    })
    if (!charge) {
        return {
            error: 'not found' as const,
        }
    }
    try {
        await assertCardWritable(charge.card_id, user.id)
    } catch {
        return { error: 'not found' as const }
    }
    try {
        const paymentAmount = charge.amount - charge.paid

        const newCharge = await db.$transaction(async (tx) => {
            const paid = await tx.charge.update({
                where: { id },
                data: { paid: charge.amount },
            })

            await tx.paymentLog.create({
                data: {
                    charge_id: id,
                    amount: paymentAmount,
                    status: 'success',
                },
            })
            await touchCardActivity(charge.card_id, tx)
            return paid
        })

        return {
            data: newCharge,
            paymentAmount,
        }
    } catch (error) {
        console.log(error)
        return {
            error: `${error}`,
        }
    }
}

export async function updateChargeAction(id: string, data: z.infer<typeof EditChargeSchema>) {
    const user = await getCurrentUserAction()
    if (!user) {
        return {
            error: 'unauthorized' as const,
        }
    }

    const charge = await db.charge.findFirst({
        where: {
            id,
        },
    })

    if (!charge) {
        return {
            error: 'not found' as const,
        }
    }
    try {
        await assertCardWritable(charge.card_id, user.id)
    } catch {
        return { error: 'not found' as const }
    }

    try {
        const parsed = EditChargeSchema.safeParse(data)
        if (!parsed.success) {
            const errors = z.flattenError(parsed.error)
            return {
                error: 'validation error' as const,
                fieldErrors: errors.fieldErrors,
            }
        }

        const updatedCharge = await db.$transaction(async (tx) => {
            const category_id = await resolveCategoryId(
                tx,
                charge.card_id,
                parsed.data.category_name,
            )
            const updated = await tx.charge.update({
                where: { id },
                data: {
                    name: parsed.data.name,
                    amount: parsed.data.amount,
                    category_id,
                },
                include: { category: true },
            })
            await touchCardActivity(charge.card_id, tx)
            return updated
        })

        return {
            data: updatedCharge,
        }
    } catch (error) {
        console.log(error)
        return {
            error: `${error}`,
        }
    }
}

export async function deleteChargeAction(id: string) {
    const user = await getCurrentUserAction()
    if (!user) {
        return {
            error: 'unauthorized' as const,
        }
    }

    const charge = await db.charge.findFirst({
        where: {
            id,
        },
    })

    if (!charge) {
        return {
            error: 'not found' as const,
        }
    }
    try {
        await assertCardWritable(charge.card_id, user.id)
    } catch {
        return { error: 'not found' as const }
    }

    try {
        await db.$transaction(async (tx) => {
            await tx.charge.delete({
                where: { id },
            })
            await touchCardActivity(charge.card_id, tx)
        })

        return {
            data: { id },
        }
    } catch (error) {
        console.log(error)
        return {
            error: `${error}`,
        }
    }
}
