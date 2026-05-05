'use server'

import { db } from '@/db/prisma'
import {
    CreateChargeSchema,
    CreateCharge,
    DEFAULT_CREATE_CHARGE_VALUE,
} from '@/schemas/charge'
import z from 'zod'
import { getCurrentUserAction } from './users.actionl'

interface GetChargesActionProps {
    card_id: string
}
export async function getChargesAction({ card_id }: GetChargesActionProps) {
    const user = await getCurrentUserAction()
    if (!user) {
        return {
            total: 0,
            data: [],
        }
    }
    const count = await db.charge.count()
    const chargues = await db.charge.findMany({
        where: { card_id },
    })
    return {
        total: count,
        data: chargues,
    }
}

interface CreateChargueProps extends CreateCharge {
    card_id: string
}
export async function createChargue(data: CreateChargueProps) {
    const charge = await db.charge.create({
        data,
    })
    return charge
}

interface CreateChargueState {
    fields: CreateCharge
    errors?: ReturnType<typeof z.flattenError<CreateCharge>>['fieldErrors']
    done?: boolean
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

    await createChargue(parsed.data)

    return {
        fields: DEFAULT_CREATE_CHARGE_VALUE,
        done: true,
    }
}
