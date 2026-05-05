import { db } from '@/db/prisma'
import { getCurrentUserAction } from '@/actions/users.actionl'
import { redirect } from 'next/navigation'

export default async function Page() {
    const user = await getCurrentUserAction()
    if (!user) {
        redirect('/auth/login')
    }
    const card = await db.card.findFirst({
        where: { owner_id: user.id },
    })
    if (!card) {
        redirect('/dashboard/card')
    }
    redirect(`/dashboard/card/${card.id}`)
}
