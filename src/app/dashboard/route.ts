import { getCurrentUserAction } from '@/actions/users.action'
import { NextRequest, NextResponse } from 'next/server'
import { listCardsForUser } from '@/lib/card-access'

export async function GET(req: NextRequest) {
    const user = await getCurrentUserAction()
    if (!user) {
        return NextResponse.redirect(new URL('/auth/login', req.nextUrl))
    }
    const cards = await listCardsForUser(user.id)
    const card = cards.all[0]
    if (!card) {
        return NextResponse.redirect(new URL('/dashboard/card', req.nextUrl))
    }
    return NextResponse.redirect(
        new URL(`/dashboard/card/${card.id}`, req.nextUrl),
    )
}
