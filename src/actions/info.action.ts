'use server'

import { db } from '@/db/prisma'
import { getCurrentUserAction } from './users.actionl'
import { Charge } from '@/db/generated/prisma/client'

export async function fetchInfoAction(card_id: string) {
    const user = await getCurrentUserAction()
    if (!user) {
        return {}
    }
    const cards = await db.card.findMany({
        where: { owner_id: user.id },
    })
    const card = cards.find((c) => c.id === card_id)
    const charges: Charge[] = []
    if (card) {
        const req = await db.charge.findMany({
            where: { card_id },
        })
        charges.push(...req)
    }
    return {
        card,
        cards,
        charges,
    }
}
