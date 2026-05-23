'use server'
import { db } from '@/db/prisma'
import {
    CreateCard,
    CreateCardSchema,
    DEFAULT_CREATE_CARD_VALUE,
} from '@/schemas/card.schema'
import { revalidateTag } from 'next/cache'
import { z } from 'zod'
import { getCurrentUserAction } from './users.action'
import { Card } from '@/db/generated/prisma/browser'

export async function createCardAction({
    brand,
    closing_day,
    credit_limit,
    due_day,
    last4,
    name,
    owner_id,
    bank,
}: CreateCard & { owner_id: string }) {
    const charge = await db.card.create({
        data: {
            owner_id,
            closing_day,
            credit_limit,
            due_day,
            last4,
            name,
            bank,
            brand,
        },
    })
    revalidateTag('cards', 'max')
    return charge
}

interface CreateChargueState {
    fields: CreateCard
    fieldErrors?: ReturnType<typeof z.flattenError<CreateCard>>['fieldErrors']
    formErrors?: string[]
    done?: Card
    lastCardId?: string
}
export async function createCardFormAction(
    state: CreateChargueState,
    formData: FormData,
): Promise<CreateChargueState> {
    const user = await getCurrentUserAction()
    if (!user) {
        return {
            fields: state.fields,
            formErrors: ['User not found'],
        }
    }
    const formObject = Object.fromEntries(formData)
    const parsed = CreateCardSchema.safeParse(formObject)
    if (!parsed.success) {
        const errors = z.flattenError(parsed.error)
        return {
            fields: state.fields,
            fieldErrors: errors.fieldErrors,
            formErrors: errors.formErrors,
        }
    }

    const newCard = await createCardAction({
        ...parsed.data,
        owner_id: user.id,
    })

    return {
        fields: DEFAULT_CREATE_CARD_VALUE,
        done: newCard,
        lastCardId: newCard.id,
    }
}

export async function getOwnCardsAction() {
    const user = await getCurrentUserAction()
    if (!user) {
        return []
    }
    const cards = db.card.findMany({
        where: { owner_id: user.id },
    })
    return cards
}
