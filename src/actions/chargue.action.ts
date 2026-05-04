'use server'

import { db } from '@/db/prisma'
import {
    CreateChargeSchema,
    CreateCharge,
    DEFAULT_CREATE_CHARGE_VALUE,
} from '@/schemas/charge'
import { cacheTag, revalidateTag } from 'next/cache'
import z from 'zod'

export async function getChargesAction() {
    'use cache'
    cacheTag('charges')

    const count = await db.charge.count()
    const chargues = await db.charge.findMany()
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
    revalidateTag('charges', 'max')
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

    await createChargue({
        amount: parsed.data.amount,
        name: parsed.data.name,
        card_id: '',
    })

    return {
        fields: DEFAULT_CREATE_CHARGE_VALUE,
        done: true,
    }
}
