import { ChargesTable } from '@/components/data-table'
import { SectionCards } from '@/components/section-cards'

import { Suspense } from 'react'
import { RegisterCardDialog } from '@/components/register-card-dialog'
import { DashboardMainLayout } from '@/components/dashboard-main-layout'
import { db } from '@/db/prisma'
import { getCurrentUserAction } from '@/actions/users.action'
import { redirect } from 'next/navigation'

export default async function Page({
    params,
}: PageProps<'/dashboard/card/[card_id]'>) {
    return (
        <Suspense>
            <Cached params={params} />
        </Suspense>
    )
}

async function Cached({
    params,
}: Readonly<{
    params: PageProps<'/dashboard/card/[card_id]'>['params']
}>) {
    const { card_id } = await params
    const user = await getCurrentUserAction()
    if (!user) {
        redirect('/auth/login')
    }
    const card = await db.card.findFirst({
        where: { id: card_id, owner_id: user.id },
        select: { id: true, name: true },
    })
    if (!card) {
        redirect('/dashboard')
    }
    return (
        <DashboardMainLayout title={card.name}>
            <SectionCards />
            <Suspense>
                <ChargesTable />
            </Suspense>
            <RegisterCardDialog />
        </DashboardMainLayout>
    )
}
