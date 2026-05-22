import { db } from '@/db/prisma'
import { getCurrentUserAction } from '@/actions/users.action'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(req: NextRequest) {
    const user = await getCurrentUserAction()
    if (!user) {
        return NextResponse.redirect(new URL('/auth/login', req.nextUrl))
    }
    const card = await db.card.findFirst({
        where: { owner_id: user.id },
    })
    if (!card) {
        return NextResponse.redirect(new URL('/dashboard/card', req.nextUrl))
    }
    return NextResponse.redirect(
        new URL(`/dashboard/card/${card.id}`, req.nextUrl),
    )
}
