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
import { assertCardWritable } from '@/lib/card-access'
import type { Prisma } from '@/db/generated/prisma/client'
import {
    beginCardChange,
    recordCardChanges,
    type CardChangeInput,
} from '@/lib/card-changes'

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
        const syncVersion = await beginCardChange(parsed.data.card_id, tx)
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
                revision: syncVersion,
            },
            include: { category: true },
        })
        const changes: CardChangeInput[] = [
            {
                entity: 'charge',
                entityId: created.id,
                operation: 'upsert',
            },
        ]
        if (category_id) {
            changes.unshift({
                entity: 'category',
                entityId: category_id,
                operation: 'upsert',
            })
        }
        await recordCardChanges(
            parsed.data.card_id,
            syncVersion,
            changes,
            tx,
        )
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
        const syncVersion = await beginCardChange(card_id, tx)
        const all = await tx.charge.findMany({
            where: { card_id },
            orderBy: { created_at: 'asc' },
        })
        const updated: ChargeWithCategory[] = []
        const payments: Array<{
            paymentId: string
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
                data: {
                    paid: charge.paid + pay,
                    revision: syncVersion,
                },
                include: { category: true },
            })
            const payment = await tx.paymentLog.create({
                data: {
                    charge_id: charge.id,
                    amount: pay,
                    status: 'success',
                },
            })
            payments.push({
                paymentId: payment.id,
                chargeId: charge.id,
                amount: pay,
                chargeDate: charge.created_at,
            })
            updated.push(newCharge)
        }
        if (updated.length > 0) {
            await recordCardChanges(
                card_id,
                syncVersion,
                [
                    ...updated.map((charge) => ({
                        entity: 'charge' as const,
                        entityId: charge.id,
                        operation: 'upsert' as const,
                    })),
                    ...payments.map((payment) => ({
                        entity: 'payment' as const,
                        entityId: payment.paymentId,
                        operation: 'upsert' as const,
                    })),
                ],
                tx,
            )
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
        const result = await db.$transaction(async (tx) => {
            const syncVersion = await beginCardChange(charge.card_id, tx)
            const current = await tx.charge.findUnique({ where: { id } })
            if (!current) return null

            const paymentAmount = current.amount - current.paid
            if (paymentAmount <= 0) {
                return { paid: current, paymentAmount: 0 }
            }

            const paid = await tx.charge.update({
                where: { id },
                data: {
                    paid: current.amount,
                    revision: syncVersion,
                },
            })

            const payment = await tx.paymentLog.create({
                data: {
                    charge_id: id,
                    amount: paymentAmount,
                    status: 'success',
                },
            })
            await recordCardChanges(
                charge.card_id,
                syncVersion,
                [
                    {
                        entity: 'charge',
                        entityId: paid.id,
                        operation: 'upsert',
                    },
                    {
                        entity: 'payment',
                        entityId: payment.id,
                        operation: 'upsert',
                    },
                ],
                tx,
            )
            return { paid, paymentAmount }
        })

        if (!result) {
            return { error: 'not found' as const }
        }

        return {
            data: result.paid,
            paymentAmount: result.paymentAmount,
        }
    } catch (error) {
        console.log(error)
        return {
            error: `${error}`,
        }
    }
}

export async function updateChargeAction(
    id: string,
    data: z.infer<typeof EditChargeSchema>,
    expectedRevision?: number,
) {
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
        if (
            expectedRevision !== undefined &&
            (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)
        ) {
            return { error: 'invalid revision' as const }
        }

        const mutation = await db.$transaction(async (tx) => {
            const syncVersion = await beginCardChange(charge.card_id, tx)
            const current = await tx.charge.findUnique({
                where: { id },
                include: { category: true },
            })
            if (!current) return { status: 'not-found' as const }
            if (
                expectedRevision !== undefined &&
                current.revision !== expectedRevision
            ) {
                return {
                    status: 'conflict' as const,
                    charge: current,
                }
            }

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
                    revision: syncVersion,
                },
                include: { category: true },
            })
            const changes: CardChangeInput[] = [
                {
                    entity: 'charge',
                    entityId: updated.id,
                    operation: 'upsert',
                },
            ]
            if (category_id) {
                changes.unshift({
                    entity: 'category',
                    entityId: category_id,
                    operation: 'upsert',
                })
            }
            await recordCardChanges(
                charge.card_id,
                syncVersion,
                changes,
                tx,
            )
            return { status: 'updated' as const, charge: updated }
        })

        if (mutation.status === 'not-found') {
            return { error: 'not found' as const }
        }
        if (mutation.status === 'conflict') {
            return {
                error: 'conflict' as const,
                conflict: mutation.charge,
            }
        }

        return { data: mutation.charge }
    } catch (error) {
        console.log(error)
        return {
            error: `${error}`,
        }
    }
}

export async function deleteChargeAction(
    id: string,
    expectedRevision?: number,
) {
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
        if (
            expectedRevision !== undefined &&
            (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0)
        ) {
            return { error: 'invalid revision' as const }
        }

        const mutation = await db.$transaction(async (tx) => {
            const syncVersion = await beginCardChange(charge.card_id, tx)
            const current = await tx.charge.findUnique({
                where: { id },
                include: { category: true },
            })
            if (!current) return { status: 'not-found' as const }
            if (
                expectedRevision !== undefined &&
                current.revision !== expectedRevision
            ) {
                return {
                    status: 'conflict' as const,
                    charge: current,
                }
            }

            await tx.charge.delete({
                where: { id },
            })
            await recordCardChanges(
                charge.card_id,
                syncVersion,
                [
                    {
                        entity: 'charge',
                        entityId: id,
                        operation: 'delete',
                    },
                ],
                tx,
            )
            return { status: 'deleted' as const }
        })

        if (mutation.status === 'not-found') {
            return { error: 'not found' as const }
        }
        if (mutation.status === 'conflict') {
            return {
                error: 'conflict' as const,
                conflict: mutation.charge,
            }
        }

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
