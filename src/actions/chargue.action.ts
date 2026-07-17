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

interface CreateChargueProps extends CreateCharge {
    card_id: string
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
    const card = await db.card.findFirst({
        where: { id: parsed.data.card_id, owner_id: user.id },
    })
    if (!card) {
        throw new Error('card not found')
    }
    const charge = await db.charge.create({
        data: parsed.data,
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
    const all = await db.charge.findMany({
        where: { card_id },
        orderBy: { created_at: 'asc' },
    })
    const updated: Charge[] = []
    const payments: Array<{ chargeId: string; amount: number; chargeDate: Date }> = []
    let remaining = amount
    for (const charge of all) {
        if (remaining <= 0) break
        const owed = charge.amount - charge.paid
        if (owed <= 0) continue
        const pay = Math.min(owed, remaining)
        remaining -= pay
        const newCharge = await db.charge.update({
            where: { id: charge.id },
            data: { paid: charge.paid + pay },
        })
        await db.paymentLog.create({
            data: {
                charge_id: charge.id,
                amount: pay,
                status: 'success',
            },
        })
        payments.push({ chargeId: charge.id, amount: pay, chargeDate: charge.created_at })
        updated.push(newCharge)
    }
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
            card: {
                owner_id: user.id,
            },
        },
    })
    if (!charge) {
        return {
            error: 'not found' as const,
        }
    }
    try {
        const paymentAmount = charge.amount - charge.paid

        const newCharge = await db.charge.update({
            where: { id },
            data: { paid: charge.amount },
        })

        await db.paymentLog.create({
            data: {
                charge_id: id,
                amount: paymentAmount,
                status: 'success',
            },
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
            card: {
                owner_id: user.id,
            },
        },
    })

    if (!charge) {
        return {
            error: 'not found' as const,
        }
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

        const updatedCharge = await db.charge.update({
            where: { id },
            data: {
                name: parsed.data.name,
                amount: parsed.data.amount,
            },
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
            card: {
                owner_id: user.id,
            },
        },
    })

    if (!charge) {
        return {
            error: 'not found' as const,
        }
    }

    try {
        await db.charge.delete({
            where: { id },
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
