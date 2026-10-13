'use client'

import { chargeTableFeatures, type ChargeTableFeatures } from '@/lib/table-features'

import {
    useTable,
    type ColumnDef,
    type ColumnFiltersState,
    type SortFn,
} from '@tanstack/react-table'
import { z } from 'zod'
import { useTableSettings } from '@/stores/table-settings.store'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { CircleCheckIcon, CircleDashedIcon, CircleDotIcon, EllipsisVerticalIcon } from 'lucide-react'
import { DataTableColumnHeader } from './data-table-column-header'
import { useCreateDialogState } from '@/stores/charges.store'
import { useEditChargeDialogState } from '@/stores/edit-charge.store'
import { useDeleteChargeDialogState } from '@/stores/delete-charge.store'
import { CreateChargeDialog } from './create-charge-dialog'
import { EditChargeDialog } from './edit-charge-dialog'
import { DeleteChargeDialog } from './delete-charge-dialog'
import { useEffect, useMemo, useState } from 'react'
import { useInfo } from '@/stores/info.store'
import { useShallow } from 'zustand/shallow'
import { DashboardTabs } from './dashboard-tabs'
import { TableProvider } from './table-context'
import type { ChargeWithCategory } from '@/stores/info.store'

export type BillingPeriodOption = {
    value: string
    label: string
}

export type BillingPeriodMode = 'month' | 'all' | 'unpaid'

export const schema = z.object({
    id: z.number(),
    header: z.string(),
    type: z.string(),
    status: z.string(),
    target: z.string(),
    limit: z.string(),
    reviewer: z.string(),
})

function ChargeActions({ charge }: { charge: ChargeWithCategory }) {
    const cardAccess = useInfo((state) => state.cardAccess)
    const pendingMutationCount = useInfo(
        (state) => state.pendingMutationCount,
    )
    const conflictCount = useInfo((state) => state.syncConflicts.length)
    const syncStatus = useInfo((state) => state.syncStatus)
    const canWrite = cardAccess === 'owner' || cardAccess === 'write'
    const isInstallmentParent = charge.kind === 'installment_parent'
    const isInstallment = charge.kind === 'installment'
    const canPay =
        canWrite &&
        !isInstallmentParent &&
        charge.paid < charge.amount &&
        pendingMutationCount === 0 &&
        conflictCount === 0 &&
        syncStatus !== 'offline' &&
        syncStatus !== 'error' &&
        syncStatus !== 'unauthorized'

    return (
        <DropdownMenu>
            <DropdownMenuTrigger
                render={
                    <Button
                        variant='ghost'
                        className='flex size-8 text-muted-foreground data-open:bg-muted'
                        size='icon'
                    />
                }
            >
                <EllipsisVerticalIcon />
                <span className='sr-only'>Open menu</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align='end' className='w-32'>
                <DropdownMenuItem
                    disabled={!canPay}
                    onClick={() => {
                        void useInfo.getState().paidCharge(charge.id)
                    }}
                >
                    Mark as paid
                </DropdownMenuItem>
                <DropdownMenuItem
                    disabled={!canWrite || isInstallment}
                    onClick={() => {
                        useEditChargeDialogState.getState().setCharge(charge)
                    }}
                >
                    Edit
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                    variant='destructive'
                    disabled={!canWrite || isInstallment}
                    onClick={() => {
                        useDeleteChargeDialogState
                            .getState()
                            .setChargeId(charge.id)
                    }}
                >
                    Delete
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    )
}

const installmentSorting: SortFn<ChargeTableFeatures, ChargeWithCategory> = (
    leftRow,
    rightRow,
    columnId,
) => {
    const left = leftRow.original
    const right = rightRow.original
    if (
        left.kind === 'installment' &&
        right.kind === 'installment' &&
        left.installment_parent_id === right.installment_parent_id
    ) {
        const difference =
            (left.installment_number ?? 0) -
            (right.installment_number ?? 0)
        const direction = leftRow
            .getAllCells()
            .find((cell) => cell.column.id === columnId)
            ?.column.getIsSorted()
        return direction === 'desc' ? -difference : difference
    }

    const leftValue = leftRow.getValue<unknown>(columnId)
    const rightValue = rightRow.getValue<unknown>(columnId)
    if (leftValue instanceof Date && rightValue instanceof Date) {
        return leftValue.getTime() - rightValue.getTime()
    }
    if (typeof leftValue === 'number' && typeof rightValue === 'number') {
        return leftValue - rightValue
    }
    return String(leftValue ?? '').localeCompare(
        String(rightValue ?? ''),
        undefined,
        { numeric: true, sensitivity: 'base' },
    )
}

function ChargeStatus({ charge }: { charge: ChargeWithCategory }) {
    const paid = charge.paid >= charge.amount
    const partial = charge.paid > 0
    const label = paid ? 'Paid' : partial ? 'Partially paid' : 'Pending'
    const Icon = paid ? CircleCheckIcon : partial ? CircleDotIcon : CircleDashedIcon
    return (
        <span title={label} className={paid ? 'text-green-600 dark:text-green-400' : partial ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}>
            <Icon className='size-4' aria-hidden='true' />
            <span className='sr-only'>{label}</span>
        </span>
    )
}

const columns: ColumnDef<ChargeTableFeatures, ChargeWithCategory>[] = [
    // {
    //   id: "drag",
    //   header: () => null,
    //   cell: ({ row }) => <DragHandle id={row.original.id} />,
    // },
    {
        id: 'select',
        header: ({ table }) => (
            <div className='flex items-center justify-center'>
                <Checkbox
                    checked={table.getIsAllPageRowsSelected()}
                    indeterminate={
                        table.getIsSomePageRowsSelected() &&
                        !table.getIsAllPageRowsSelected()
                    }
                    onCheckedChange={(value) =>
                        table.toggleAllPageRowsSelected(!!value)
                    }
                    aria-label='Select all'
                />
            </div>
        ),
        cell: ({ row }) => (
            <div className='flex items-center justify-center'>
                <Checkbox
                    checked={row.getIsSelected()}
                    onCheckedChange={(value) => row.toggleSelected(!!value)}
                    aria-label='Select row'
                />
            </div>
        ),
        enableSorting: false,
        enableHiding: false,
    },
    {
        accessorKey: 'name',
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title='Name' />
        ),
        cell: ({ row }) => {
            const charge = row.original
            const isInstallmentParent =
                charge.kind === 'installment_parent'
            const isInstallment = charge.kind === 'installment'

            return (
                <div
                    className={
                        isInstallment
                            ? 'flex min-w-52 items-center gap-2 pl-5'
                            : 'flex min-w-52 items-center gap-2'
                    }
                >
                    <span
                        className={
                            isInstallmentParent ? 'font-semibold' : undefined
                        }
                    >
                        {charge.name}
                    </span>
                    <ChargeStatus charge={charge} />
                    {isInstallmentParent ? (
                        <Badge variant='secondary'>Plan</Badge>
                    ) : null}
                    {isInstallment ? (
                        <Badge variant='outline'>
                            Mes {charge.installment_number}/
                            {charge.installment_count}
                        </Badge>
                    ) : null}
                </div>
            )
        },
        enableHiding: false,
        sortFn: installmentSorting,
    },
    {
        accessorKey: 'amount',
        header: ({ column }) => (
            <DataTableColumnHeader left column={column} title='Amount' />
        ),
        cell: ({ row }) => {
            const amount = Number.parseFloat(row.getValue('amount'))
            const formatted = new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD',
            }).format(amount / 100)

            return (
                <div className='pr-3 text-right tabular-nums'>
                    <div className='font-medium'>{formatted}</div>
                    <div className='text-xs text-muted-foreground'>
                        Paid {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(row.original.paid / 100)}
                    </div>
                </div>
            )
        },
        sortFn: installmentSorting,
        // cell: ({ row }) => (
        //     <form
        //         onSubmit={(e) => {
        //             e.preventDefault()
        //             toast.promise(
        //                 new Promise((resolve) => setTimeout(resolve, 1000)),
        //                 {
        //                     loading: `Saving ${row.original.header}`,
        //                     success: 'Done',
        //                     error: 'Error',
        //                 },
        //             )
        //         }}
        //     >
        //         <Label
        //             htmlFor={`${row.original.id}-target`}
        //             className='sr-only'
        //         >
        //             Target
        //         </Label>
        //         <Input
        //             className='h-8 w-16 border-transparent bg-transparent text-right shadow-none hover:bg-input/30 focus-visible:border focus-visible:bg-background dark:bg-transparent dark:hover:bg-input/30 dark:focus-visible:bg-input/30'
        //             defaultValue={row.original.target}
        //             id={`${row.original.id}-target`}
        //         />
        //     </form>
        // ),
    },
    {
        id: 'category',
        accessorFn: (row) => row.category?.name ?? 'Uncategorized',
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title='Category' />
        ),
        cell: ({ row }) => (
            <Badge variant='secondary' className='whitespace-nowrap'>
                {row.original.category?.name ?? 'Uncategorized'}
            </Badge>
        ),
        sortFn: installmentSorting,
    },
    {
        accessorKey: 'scheduled_for',
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title='Date' />
        ),
        cell: ({ row }) => {
            const rawDate = row.getValue('scheduled_for')
            const date =
                rawDate instanceof Date ? rawDate : new Date(String(rawDate))
            const formatted = new Intl.DateTimeFormat('es-MX', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                timeZone: 'UTC',
            }).format(date)

            return <div className='whitespace-nowrap'>{formatted}</div>
        },
        sortFn: installmentSorting,
    },
    // {
    //     accessorKey: 'type',
    //     header: 'Section Type',
    //     cell: ({ row }) => (
    //         <div className='w-32'>
    //             <Badge
    //                 variant='outline'
    //                 className='px-1.5 text-muted-foreground'
    //             >
    //                 {row.original.type}
    //             </Badge>
    //         </div>
    //     ),
    // },
    // {
    //     accessorKey: 'reviewer',
    //     header: 'Reviewer',
    //     cell: ({ row }) => {
    //         const isAssigned = row.original.reviewer !== 'Assign reviewer'
    //         if (isAssigned) {
    //             return row.original.reviewer
    //         }
    //         return (
    //             <>
    //                 <Label
    //                     htmlFor={`${row.original.id}-reviewer`}
    //                     className='sr-only'
    //                 >
    //                     Reviewer
    //                 </Label>
    //                 <Select
    //                     items={[
    //                         { label: 'Eddie Lake', value: 'Eddie Lake' },
    //                         {
    //                             label: 'Jamik Tashpulatov',
    //                             value: 'Jamik Tashpulatov',
    //                         },
    //                     ]}
    //                 >
    //                     <SelectTrigger
    //                         className='w-38 **:data-[slot=select-value]:block **:data-[slot=select-value]:truncate'
    //                         size='sm'
    //                         id={`${row.original.id}-reviewer`}
    //                     >
    //                         <SelectValue placeholder='Assign reviewer' />
    //                     </SelectTrigger>
    //                     <SelectContent align='end'>
    //                         <SelectGroup>
    //                             <SelectItem value='Eddie Lake'>
    //                                 Eddie Lake
    //                             </SelectItem>
    //                             <SelectItem value='Jamik Tashpulatov'>
    //                                 Jamik Tashpulatov
    //                             </SelectItem>
    //                         </SelectGroup>
    //                     </SelectContent>
    //                 </Select>
    //             </>
    //         )
    //     },
    // },
    {
        id: 'actions',
        cell: ({ row }) => <ChargeActions charge={row.original} />,
    },
]

function daysInUtcMonth(year: number, monthIndex: number) {
    return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate()
}

function billingStartForMonth(year: number, monthIndex: number, closingDay: number) {
    return new Date(
        Date.UTC(
            year,
            monthIndex,
            Math.min(closingDay, daysInUtcMonth(year, monthIndex)) + 1,
        ),
    )
}

function dateKey(date: Date) {
    return date.toISOString().slice(0, 10)
}

function getBillingPeriodStart(date: Date, closingDay: number) {
    const year = date.getUTCFullYear()
    const month = date.getUTCMonth()
    const currentStart = billingStartForMonth(year, month, closingDay)

    if (date.getTime() >= currentStart.getTime()) {
        return currentStart
    }

    return billingStartForMonth(year, month - 1, closingDay)
}

function getNextBillingPeriodStart(periodStart: Date, closingDay: number) {
    // The start can fall on the first of the next month for month-end cuts.
    // Use the preceding closing date to determine the next closing month.
    const closingDate = new Date(periodStart)
    closingDate.setUTCDate(closingDate.getUTCDate() - 1)
    return billingStartForMonth(
        closingDate.getUTCFullYear(),
        closingDate.getUTCMonth() + 1,
        closingDay,
    )
}

function formatBillingPeriodLabel(periodKey: string, closingDay: number) {
    const start = new Date(`${periodKey}T00:00:00.000Z`)
    const end = new Date(getNextBillingPeriodStart(start, closingDay))
    end.setUTCDate(end.getUTCDate() - 1)

    const formatter = new Intl.DateTimeFormat('es-MX', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        timeZone: 'UTC',
    })

    return `${formatter.format(start)} - ${formatter.format(end)}`
}

function getContinuousBillingPeriodKeys(
    periodKeys: Set<string>,
    closingDay: number,
) {
    const sortedKeys = Array.from(periodKeys).sort()
    const firstKey = sortedKeys[0]
    const lastKey = sortedKeys.at(-1)

    if (!firstKey || !lastKey) return []

    const keys: string[] = []
    let periodStart = new Date(`${firstKey}T00:00:00.000Z`)
    const lastStart = new Date(`${lastKey}T00:00:00.000Z`)

    while (periodStart.getTime() <= lastStart.getTime()) {
        keys.push(dateKey(periodStart))

        const nextStart = getNextBillingPeriodStart(periodStart, closingDay)
        if (nextStart.getTime() <= periodStart.getTime()) break

        periodStart = nextStart
    }

    return keys
}

function isUnpaidCharge(charge: ChargeWithCategory) {
    return charge.paid < charge.amount
}

export function ChargesTable({
    cardId,
    userId,
}: {
    cardId: string
    userId: string
}) {
    const openCreateDialog = useCreateDialogState((s) => s.toggle)
    const { data, card, fetch, syncCard } = useInfo(
        useShallow((s) => ({
            data:
                s.activeCardId === cardId && s.activeUserId === userId
                    ? s.charges
                    : [],
            card:
                s.activeCardId === cardId && s.activeUserId === userId
                    ? s.card
                    : null,
            fetch: s.fetch,
            syncCard: s.syncCard,
        })),
    )
    const closingDay = card?.closing_day ?? 1
    const currentBillingPeriod = dateKey(
        getBillingPeriodStart(new Date(), closingDay),
    )
    const [periodMode, setPeriodMode] = useState<BillingPeriodMode>('month')
    const [selectedPeriod, setSelectedPeriod] = useState(currentBillingPeriod)
    const billingPeriods = useMemo<BillingPeriodOption[]>(() => {
        const periodKeys = new Set([currentBillingPeriod])
        for (const charge of data) {
            periodKeys.add(
                dateKey(getBillingPeriodStart(charge.scheduled_for, closingDay)),
            )
        }

        return getContinuousBillingPeriodKeys(periodKeys, closingDay)
            .sort((left, right) => right.localeCompare(left))
            .map((periodKey) => ({
                value: periodKey,
                label: formatBillingPeriodLabel(periodKey, closingDay),
            }))
    }, [closingDay, currentBillingPeriod, data])
    const filteredData = useMemo(() => {
        if (periodMode === 'all') return data

        const visibleIds = new Set<string>()
        const visibleParentIds = new Set<string>()

        for (const charge of data) {
            if (periodMode === 'unpaid') {
                if (!isUnpaidCharge(charge)) continue
            } else {
                const periodKey = dateKey(
                    getBillingPeriodStart(charge.scheduled_for, closingDay),
                )
                if (periodKey !== selectedPeriod) continue
            }

            visibleIds.add(charge.id)
            if (charge.installment_parent_id) {
                visibleParentIds.add(charge.installment_parent_id)
            }
        }

        return data.filter(
            (charge) =>
                visibleIds.has(charge.id) || visibleParentIds.has(charge.id),
        )
    }, [closingDay, data, periodMode, selectedPeriod])
    const { groupedData, installmentsByParent } = useMemo(() => {
        const installmentsByParent = new Map<string, ChargeWithCategory[]>()
        for (const charge of filteredData) {
            if (
                charge.kind !== 'installment' ||
                !charge.installment_parent_id
            ) {
                continue
            }
            const installments =
                installmentsByParent.get(charge.installment_parent_id) ?? []
            installments.push(charge)
            installmentsByParent.set(
                charge.installment_parent_id,
                installments,
            )
        }

        const grouped: ChargeWithCategory[] = []
        const includedInstallments = new Set<string>()
        for (const charge of filteredData) {
            if (charge.kind === 'installment') continue
            grouped.push(charge)

            if (charge.kind !== 'installment_parent') continue
            const installments = [
                ...(installmentsByParent.get(charge.id) ?? []),
            ].sort(
                (left, right) =>
                    (left.installment_number ?? 0) -
                    (right.installment_number ?? 0),
            )
            installmentsByParent.set(charge.id, installments)
            for (const installment of installments) {
                includedInstallments.add(installment.id)
            }
        }

        for (const charge of filteredData) {
            if (
                charge.kind === 'installment' &&
                !includedInstallments.has(charge.id)
            ) {
                grouped.push(charge)
            }
        }
        return { groupedData: grouped, installmentsByParent }
    }, [filteredData])
    const rowCount = groupedData.length
    const [rowSelection, setRowSelection] = useState({})
    const { columnVisibility, sorting, pageSize, setColumnVisibility, setSorting, setPageSize } = useTableSettings()
    const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
    const [pageIndex, setPageIndex] = useState(0)
    const pagination = { pageIndex, pageSize }
    useEffect(() => {
        void useTableSettings.persist.rehydrate()
    }, [])
    useEffect(() => {
        void fetch(cardId, userId)
    }, [cardId, fetch, userId])
    const billingContext = `${cardId}:${currentBillingPeriod}`
    const [previousBillingContext, setPreviousBillingContext] = useState(billingContext)
    if (previousBillingContext !== billingContext) {
        setPreviousBillingContext(billingContext)
        setSelectedPeriod(currentBillingPeriod)
    }
    const periodContext = `${periodMode}:${selectedPeriod}`
    const [previousPeriodContext, setPreviousPeriodContext] = useState(periodContext)
    if (previousPeriodContext !== periodContext) {
        setPreviousPeriodContext(periodContext)
        setPageIndex(0)
        setRowSelection({})
    }
    useEffect(() => {
        let checking = false

        async function checkForCardUpdates() {
            if (
                checking ||
                document.visibilityState !== 'visible' ||
                navigator.onLine === false
            ) {
                return
            }
            checking = true
            try {
                await syncCard(cardId, userId)
            } finally {
                checking = false
            }
        }

        const interval = window.setInterval(checkForCardUpdates, 30_000)
        const checkWhenVisible = () => {
            if (document.visibilityState === 'visible') {
                void checkForCardUpdates()
            }
        }
        const markOffline = () => {
            const state = useInfo.getState()
            if (
                state.activeCardId === cardId &&
                state.activeUserId === userId
            ) {
                useInfo.setState({ syncStatus: 'offline' })
            }
        }
        window.addEventListener('focus', checkForCardUpdates)
        window.addEventListener('online', checkForCardUpdates)
        window.addEventListener('offline', markOffline)
        document.addEventListener('visibilitychange', checkWhenVisible)

        return () => {
            window.clearInterval(interval)
            window.removeEventListener('focus', checkForCardUpdates)
            window.removeEventListener('online', checkForCardUpdates)
            window.removeEventListener('offline', markOffline)
            document.removeEventListener('visibilitychange', checkWhenVisible)
        }
    }, [cardId, syncCard, userId])

    const table = useTable({
        features: chargeTableFeatures,
        data: groupedData,
        columns,
        rowCount,
        state: {
            sorting,
            columnVisibility,
            rowSelection,
            columnFilters,
            pagination,
            expanded: true,
        },
        getRowId: (row) => row.id.toString(),
        enableRowSelection: true,
        onRowSelectionChange: setRowSelection,
        onSortingChange: setSorting,
        onColumnFiltersChange: setColumnFilters,
        onColumnVisibilityChange: setColumnVisibility,
        onPaginationChange: (updater) => {
            const next = typeof updater === 'function' ? updater(pagination) : updater
            setPageIndex(next.pageIndex)
            if (next.pageSize !== pageSize) setPageSize(next.pageSize)
        },
        getSubRows: (row) => installmentsByParent.get(row.id),
        filterFromLeafRows: true,
        paginateExpandedRows: false,
    })
    return (
        <TableProvider table={table}>
            <DashboardTabs
                openCreateDialog={openCreateDialog}
                periodMode={periodMode}
                selectedPeriod={selectedPeriod}
                billingPeriods={billingPeriods}
                onPeriodModeChange={setPeriodMode}
                onSelectedPeriodChange={setSelectedPeriod}
            />
            <CreateChargeDialog />
            <EditChargeDialog />
            <DeleteChargeDialog />
        </TableProvider>
    )
}
