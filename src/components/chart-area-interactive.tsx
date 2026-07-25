'use client'

import * as React from 'react'
import { Area, AreaChart, CartesianGrid, XAxis } from 'recharts'

import { useIsMobile } from '@/hooks/use-mobile'
import { useInfo } from '@/stores/info.store'
import {
    Card,
    CardAction,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from '@/components/ui/card'
import {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
    type ChartConfig,
} from '@/components/ui/chart'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

export const description = 'An interactive area chart'

const chartConfig = {
    charges: {
        label: 'Charges',
        color: 'var(--primary)',
    },
    payments: {
        label: 'Payments',
        color: 'var(--primary)',
    },
} satisfies ChartConfig

export function ChartAreaInteractive() {
    const isMobile = useIsMobile()
    const [timeRange, setTimeRange] = React.useState(() =>
        isMobile ? '7d' : '90d',
    )
    const summary = useInfo((s) => s.summary)

    const today = new Date()
    const todayKey = `${today.getFullYear()}-${String(
        today.getMonth() + 1,
    ).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    const filteredData = summary.filter((item) => {
        let daysToSubtract = 90
        if (timeRange === '30d') {
            daysToSubtract = 30
        } else if (timeRange === '7d') {
            daysToSubtract = 7
        }
        const startDate = new Date(today)
        startDate.setDate(startDate.getDate() - daysToSubtract)
        const startKey = `${startDate.getFullYear()}-${String(
            startDate.getMonth() + 1,
        ).padStart(2, '0')}-${String(startDate.getDate()).padStart(2, '0')}`
        return item.date >= startKey && item.date <= todayKey
    })

    return (
        <Card className='@container/card'>
            <CardHeader>
                <CardTitle>Charges Overview</CardTitle>
                <CardDescription>
                    <span className='hidden @[540px]/card:block'>
                        Charges for the last 3 months
                    </span>
                    <span className='@[540px]/card:hidden'>Last 3 months</span>
                </CardDescription>
                <CardAction>
                    <ToggleGroup
                        multiple={false}
                        value={timeRange ? [timeRange] : []}
                        onValueChange={(value) => {
                            setTimeRange(value[0] ?? '90d')
                        }}
                        variant='outline'
                        className='hidden *:data-[slot=toggle-group-item]:px-4! @[767px]/card:flex'
                    >
                        <ToggleGroupItem value='90d'>
                            Last 3 months
                        </ToggleGroupItem>
                        <ToggleGroupItem value='30d'>
                            Last 30 days
                        </ToggleGroupItem>
                        <ToggleGroupItem value='7d'>
                            Last 7 days
                        </ToggleGroupItem>
                    </ToggleGroup>
                    <Select
                        value={timeRange}
                        onValueChange={(value) => {
                            if (value !== null) {
                                setTimeRange(value)
                            }
                        }}
                    >
                        <SelectTrigger
                            className='flex w-40 **:data-[slot=select-value]:block **:data-[slot=select-value]:truncate @[767px]/card:hidden'
                            size='sm'
                            aria-label='Select a value'
                        >
                            <SelectValue placeholder='Last 3 months' />
                        </SelectTrigger>
                        <SelectContent className='rounded-xl'>
                            <SelectItem value='90d' className='rounded-lg'>
                                Last 3 months
                            </SelectItem>
                            <SelectItem value='30d' className='rounded-lg'>
                                Last 30 days
                            </SelectItem>
                            <SelectItem value='7d' className='rounded-lg'>
                                Last 7 days
                            </SelectItem>
                        </SelectContent>
                    </Select>
                </CardAction>
            </CardHeader>
            <CardContent className='px-2 pt-4 sm:px-6 sm:pt-6'>
                <ChartContainer
                    config={chartConfig}
                    className='aspect-auto h-[250px] w-full'
                >
                    <AreaChart data={filteredData}>
                        <defs>
                            <linearGradient
                                id='fillCharges'
                                x1='0'
                                y1='0'
                                x2='0'
                                y2='1'
                            >
                                <stop
                                    offset='5%'
                                    stopColor='var(--color-charges)'
                                    stopOpacity={1.0}
                                />
                                <stop
                                    offset='95%'
                                    stopColor='var(--color-charges)'
                                    stopOpacity={0.1}
                                />
                            </linearGradient>
                        </defs>
                        <CartesianGrid vertical={false} />
                        <XAxis
                            dataKey='date'
                            tickLine={false}
                            axisLine={false}
                            tickMargin={8}
                            minTickGap={32}
                            tickFormatter={(value) => {
                                const date = new Date(value)
                                return date.toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    timeZone: 'UTC',
                                })
                            }}
                        />
                        <ChartTooltip
                            cursor={false}
                            content={
                                <ChartTooltipContent
                                    labelFormatter={(value) => {
                                        return new Date(
                                            value,
                                        ).toLocaleDateString('en-US', {
                                            month: 'short',
                                            day: 'numeric',
                                            timeZone: 'UTC',
                                        })
                                    }}
                                    indicator='dot'
                                />
                            }
                        />
                        <Area
                            dataKey='payments'
                            type='natural'
                            fill='url(#fillCharges)'
                            stroke='var(--color-charges)'
                            stackId='a'
                        />
                        <Area
                            dataKey='charges'
                            type='natural'
                            fill='url(#fillCharges)'
                            stroke='var(--color-charges)'
                            stackId='a'
                        />
                    </AreaChart>
                </ChartContainer>
            </CardContent>
        </Card>
    )
}
