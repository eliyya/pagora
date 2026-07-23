import { ChargesTable } from '@/components/data-table'
import { SectionCards } from '@/components/section-cards'

import { Suspense } from 'react'
import { RegisterCardDialog } from '@/components/register-card-dialog'
import { DashboardMainLayout } from '@/components/dashboard-main-layout'
import { getCurrentUserAction } from '@/actions/users.action'
import { redirect } from 'next/navigation'
import { getCardAccess } from '@/lib/card-access'

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
    const result = await getCardAccess(card_id, user.id)
    if (!result || result.access === 'none') {
        redirect('/dashboard')
    }
    return (
        <DashboardMainLayout title={result.card.name}>
            <SectionCards />
            <Suspense>
                <ChargesTable cardId={card_id} userId={user.id} />
            </Suspense>
            <RegisterCardDialog />
        </DashboardMainLayout>
    )
}
