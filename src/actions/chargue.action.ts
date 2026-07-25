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
import { Charge } from '@/db/generated/prisma/browser'
import { assertCardWritable } from '@/lib/card-access'
import type { Prisma } from '@/db/generated/prisma/client'
import {
    beginCardChange,
    recordCardChanges,
    type CardChangeInput,
} from '@/lib/card-changes'
import {
    payCardAmount,
    payChargeFully,
} from '@/lib/charge-payments'
import { isDateOnly } from '@/lib/installments'

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

export async function batchPayChargesAction(
    card_id: string,
    amount: number,
    requestId: string,
    asOfDate: string,
) {
    const user = await getCurrentUserAction()
    if (!user) {
        return { error: 'unauthorized' as const }
    }
    if (
        !Number.isSafeInteger(amount) ||
        amount <= 0 ||
        amount > 2_147_483_647 ||
        typeof requestId !== 'string' ||
        requestId.length === 0 ||
        requestId.length > 440 ||
        !isDateOnly(asOfDate)
    ) {
        return { error: 'validation error' as const }
    }
    try {
        await assertCardWritable(card_id, user.id)
    } catch {
        return { error: 'not found' as const }
    }
    const result = await payCardAmount(card_id, amount, {
        asOfDate,
        idempotency: {
            requestId,
            userId: user.id,
        },
    })
    if (result.status === 'not-found') {
        return { error: 'not found' as const }
    }
    if (result.status === 'idempotency-conflict') {
        return { error: 'idempotency conflict' as const }
    }

    return {
        data: result.updatedCharges,
        payments: result.payments.map((payment) => ({
            paymentId: payment.paymentId,
            chargeId: payment.chargeId,
            amount: payment.amount,
            chargeDate: payment.scheduledFor,
        })),
        appliedAmount: amount - result.remaining,
        unappliedAmount: result.remaining,
    }
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
        const result = await payChargeFully(charge.card_id, id)
        if (result.status === 'not-found') {
            return { error: 'not found' as const }
        }
        if (result.status === 'installment-parent') {
            return { error: 'installment parent is not payable' as const }
        }

        return {
            data: result.charge,
            relatedCharges: result.updatedCharges,
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
            const current = await tx.charge.findUnique({
                where: { id },
                include: { category: true },
            })
            if (!current) return { status: 'not-found' as const }
            if (current.kind !== 'single') {
                return { status: 'managed-installment' as const }
            }
            if (
                expectedRevision !== undefined &&
                current.revision !== expectedRevision
            ) {
                return {
                    status: 'conflict' as const,
                    charge: current,
                }
            }

            const syncVersion = await beginCardChange(charge.card_id, tx)
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
        if (mutation.status === 'managed-installment') {
            return { error: 'installment plan requires synchronized edit' as const }
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
            const current = await tx.charge.findUnique({
                where: { id },
                include: { category: true },
            })
            if (!current) return { status: 'not-found' as const }
            if (current.kind !== 'single') {
                return { status: 'managed-installment' as const }
            }
            if (
                expectedRevision !== undefined &&
                current.revision !== expectedRevision
            ) {
                return {
                    status: 'conflict' as const,
                    charge: current,
                }
            }

            const syncVersion = await beginCardChange(charge.card_id, tx)
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
        if (mutation.status === 'managed-installment') {
            return {
                error: 'installment plan requires synchronized delete' as const,
            }
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
