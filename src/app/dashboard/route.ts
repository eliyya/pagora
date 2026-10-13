import { app } from '@/lib/routes'
import { APP_URL } from '@/lib/envs'
import { getCurrentUserAction } from '@/actions/users.action'
import { NextResponse } from 'next/server'
import { listCardsForUser } from '@/lib/card-access'

export async function GET() {
    const user = await getCurrentUserAction()
    if (!user) {
        return NextResponse.redirect(new URL(app.auth.login(), APP_URL))
    }
    const cards = await listCardsForUser(user.id)
    const card = cards.all[0]
    if (!card) {
        return NextResponse.redirect(new URL(app.dashboard.card(), APP_URL))
    }
    return NextResponse.redirect(
        new URL(app.dashboard.card.$card_id(card.id), APP_URL),
    )
}
