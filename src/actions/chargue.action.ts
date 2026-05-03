'use server'

import { db } from '@/db/prisma'
import {
    CreateChargeSchema,
    CreateChargue,
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

export async function createChargue(data: CreateChargue) {
    const charge = await db.charge.create({
        data,
    })
    revalidateTag('charges', 'max')
    return charge
}

interface CreateChargueState {
    fields: CreateChargue
    errors?: ReturnType<typeof z.flattenError<CreateChargue>>['fieldErrors']
    done?: boolean
}
export async function createChargueFormAction(
    state: CreateChargueState,
    formData: FormData,
): Promise<CreateChargueState> {
    const formObject = Object.fromEntries(formData)
    console.log(formObject)
    const parsed = CreateChargeSchema.safeParse(formObject)
    if (!parsed.success) {
        const errors = z.flattenError(parsed.error)
        console.log(errors)

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
