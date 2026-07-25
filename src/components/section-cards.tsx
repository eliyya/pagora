'use client'

import { Badge } from '@/components/ui/badge'
import {
    Card,
    CardAction,
    CardDescription,
    CardFooter,
    CardHeader,
    CardTitle,
} from '@/components/ui/card'
import { useInfo } from '@/stores/info.store'
import { TrendingUpIcon, TrendingDownIcon } from 'lucide-react'
import { useShallow } from 'zustand/shallow'

function monthKey(offset = 0) {
    const date = new Date()
    date.setDate(1)
    date.setMonth(date.getMonth() + offset)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

export function SectionCards() {
    const charges = useInfo(useShallow((s) => s.charges))
    const billableCharges = charges.filter(
        (charge) => charge.kind !== 'installment_parent',
    )

    const totalPending = billableCharges.reduce(
        (a, b) => a + (b.amount - b.paid),
        0,
    )
    const currentMonth = monthKey()
    const previousMonth = monthKey(-1)
    const thisMonth = billableCharges.filter(
        (charge) =>
            charge.scheduled_for.toISOString().slice(0, 7) === currentMonth,
    )
    const lastMonth = billableCharges.filter(
        (charge) =>
            charge.scheduled_for.toISOString().slice(0, 7) === previousMonth,
    )
    const thisAmount = thisMonth.reduce((a, b) => a + b.amount, 0)
    const lastAmount = lastMonth.reduce((a, b) => a + b.amount, 0)

    const trend =
        lastAmount > 0
            ? ((thisAmount - lastAmount) / lastAmount) * 100
            : thisAmount > 0
              ? 100
              : 0
    const trendUp = trend >= 0
    const trendLabel = trendUp ? 'Trending up' : 'Trending down'
    const trendPct = `${trendUp ? '+' : ''}${trend.toFixed(1)}%`

    const totalPaid = billableCharges.reduce((a, b) => a + b.paid, 0)
    const pendingCount = billableCharges.filter(
        (c) => c.amount > c.paid,
    ).length
    const avgCharge =
        billableCharges.length > 0
            ? billableCharges.reduce((a, b) => a + b.amount, 0) /
              billableCharges.length
            : 0

    return (
        <div className='grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-linear-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4 dark:*:data-[slot=card]:bg-card'>
            <Card className='@container/card'>
                <CardHeader>
                    <CardDescription>Total Pendient</CardDescription>
                    <CardTitle className='text-2xl font-semibold tabular-nums @[250px]/card:text-3xl'>
                        {new Intl.NumberFormat('en-US', {
                            style: 'currency',
                            currency: 'USD',
                        }).format(totalPending / 100)}
                    </CardTitle>
                    <CardAction>
                        <Badge variant='outline'>
                            {trendUp ? <TrendingUpIcon /> : <TrendingDownIcon />}
                            {trendPct}
                        </Badge>
                    </CardAction>
                </CardHeader>
                <CardFooter className='flex-col items-start gap-1.5 text-sm'>
                    <div className='line-clamp-1 flex gap-2 font-medium'>
                        {trendLabel} this month{' '}
                        {trendUp ? (
                            <TrendingUpIcon className='size-4' />
                        ) : (
                            <TrendingDownIcon className='size-4' />
                        )}
                    </div>
                    <div className='text-muted-foreground'>
                        {thisMonth.length} charges this month vs{' '}
                        {lastMonth.length} last month
                    </div>
                </CardFooter>
            </Card>
            <Card className='@container/card'>
                <CardHeader>
                    <CardDescription>Total Paid</CardDescription>
                    <CardTitle className='text-2xl font-semibold tabular-nums @[250px]/card:text-3xl'>
                        {new Intl.NumberFormat('en-US', {
                            style: 'currency',
                            currency: 'USD',
                        }).format(totalPaid / 100)}
                    </CardTitle>
                    <CardAction>
                        <Badge variant='outline'>
                            <TrendingUpIcon />
                            {billableCharges.length} charges
                        </Badge>
                    </CardAction>
                </CardHeader>
                <CardFooter className='flex-col items-start gap-1.5 text-sm'>
                    <div className='line-clamp-1 flex gap-2 font-medium'>
                        {pendingCount} pending{' '}
                        <TrendingDownIcon className='size-4' />
                    </div>
                    <div className='text-muted-foreground'>
                        Still need to be paid
                    </div>
                </CardFooter>
            </Card>
            <Card className='@container/card'>
                <CardHeader>
                    <CardDescription>Avg per Charge</CardDescription>
                    <CardTitle className='text-2xl font-semibold tabular-nums @[250px]/card:text-3xl'>
                        {new Intl.NumberFormat('en-US', {
                            style: 'currency',
                            currency: 'USD',
                        }).format(avgCharge / 100)}
                    </CardTitle>
                    <CardAction>
                        <Badge variant='outline'>
                            {thisAmount > lastAmount ? (
                                <TrendingUpIcon />
                            ) : (
                                <TrendingDownIcon />
                            )}
                            {trendPct}
                        </Badge>
                    </CardAction>
                </CardHeader>
                <CardFooter className='flex-col items-start gap-1.5 text-sm'>
                    <div className='line-clamp-1 flex gap-2 font-medium'>
                        {thisMonth.length} this month{' '}
                        {trendUp ? (
                            <TrendingUpIcon className='size-4' />
                        ) : (
                            <TrendingDownIcon className='size-4' />
                        )}
                    </div>
                    <div className='text-muted-foreground'>
                        {lastMonth.length} last month
                    </div>
                </CardFooter>
            </Card>
            <Card className='@container/card'>
                <CardHeader>
                    <CardDescription>Payment Rate</CardDescription>
                    <CardTitle className='text-2xl font-semibold tabular-nums @[250px]/card:text-3xl'>
                        {totalPending + totalPaid > 0
                            ? `${((totalPaid / (totalPending + totalPaid)) * 100).toFixed(1)}%`
                            : '0%'}
                    </CardTitle>
                    <CardAction>
                        <Badge variant='outline'>
                            {totalPending > 0 ? (
                                <TrendingDownIcon />
                            ) : (
                                <TrendingUpIcon />
                            )}
                            {totalPending > 0
                                ? `${pendingCount} pending`
                                : 'All paid'}
                        </Badge>
                    </CardAction>
                </CardHeader>
                <CardFooter className='flex-col items-start gap-1.5 text-sm'>
                    <div className='line-clamp-1 flex gap-2 font-medium'>
                        {pendingCount === 0
                            ? 'All charges paid'
                            : `${pendingCount} charge${pendingCount > 1 ? 's' : ''} remaining`}
                        {pendingCount === 0 ? (
                            <TrendingUpIcon className='size-4' />
                        ) : (
                            <TrendingDownIcon className='size-4' />
                        )}
                    </div>
                    <div className='text-muted-foreground'>
                        {totalPending > 0
                            ? new Intl.NumberFormat('en-US', {
                                  style: 'currency',
                                  currency: 'USD',
                              }).format(totalPending / 100)
                            : 'Fully paid'}
                    </div>
                </CardFooter>
            </Card>
        </div>
    )
}
