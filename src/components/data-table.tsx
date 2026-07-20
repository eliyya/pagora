'use client'

import {
    getCoreRowModel,
    getFacetedRowModel,
    getFacetedUniqueValues,
    getFilteredRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    useReactTable,
    type ColumnDef,
    type ColumnFiltersState,
    type SortingState,
    type VisibilityState,
} from '@tanstack/react-table'
import { z } from 'zod'

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
import { CircleCheckIcon, LoaderIcon, EllipsisVerticalIcon } from 'lucide-react'
import { DataTableColumnHeader } from './data-table-column-header'
import { useCreateDialogState } from '@/stores/charges.store'
import { useEditChargeDialogState } from '@/stores/edit-charge.store'
import { useDeleteChargeDialogState } from '@/stores/delete-charge.store'
import { Charge } from '@/db/generated/prisma/browser'
import { CreateChargeDialog } from './create-charge-dialog'
import { EditChargeDialog } from './edit-charge-dialog'
import { DeleteChargeDialog } from './delete-charge-dialog'
import { useEffect, useState } from 'react'
import { useInfo } from '@/stores/info.store'
import { useParams } from 'next/navigation'
import { useShallow } from 'zustand/shallow'
import { DashboardTabs } from './dashboard-tabs'
import { TableProvider } from './table-context'

export const schema = z.object({
    id: z.number(),
    header: z.string(),
    type: z.string(),
    status: z.string(),
    target: z.string(),
    limit: z.string(),
    reviewer: z.string(),
})

const columns: ColumnDef<Charge>[] = [
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
        // cell: ({ row }) => {
        //     return <TableCellViewer item={row.original} />
        // },
        enableHiding: false,
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
                <div className='text-right font-medium pr-3'>{formatted}</div>
            )
        },
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
        accessorKey: 'created_at',
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title='Date' />
        ),
        cell: ({ row }) => {
            const rawDate = row.getValue('created_at')
            const date =
                rawDate instanceof Date ? rawDate : new Date(String(rawDate))
            const formatted = new Intl.DateTimeFormat('es-MX', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
            }).format(date)

            return <div className='whitespace-nowrap'>{formatted}</div>
        },
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
    {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
            <Badge variant='outline' className='px-1.5 text-muted-foreground'>
                {row.original.amount <= row.original.paid ? (
                    <CircleCheckIcon className='fill-green-500 dark:fill-green-400' />
                ) : (
                    <LoaderIcon />
                )}
                {row.original.paid >= row.original.amount
                    ? 'paided'
                    : row.original.paid == 0
                      ? 'pendient'
                      : 'in progress'}
            </Badge>
        ),
    },
    {
        id: 'paid',
        accessorKey: 'paided',
        header: ({ column }) => (
            <DataTableColumnHeader left column={column} title='Paided' />
        ),
        cell: ({ row }) => {
            const formatted = new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD',
            }).format(row.original.paid / 100)

            return (
                <div className='text-right font-medium pr-3'>{formatted}</div>
            )
        },
    },
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
        cell: ({ row }) => {
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
                            onClick={() => {
                                useInfo.getState().paidCharge(row.original.id)
                            }}
                        >
                            Marks as paided
                        </DropdownMenuItem>
                        <DropdownMenuItem
                            onClick={() => {
                                useEditChargeDialogState
                                    .getState()
                                    .setCharge(row.original)
                            }}
                        >
                            Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem>Make a copy</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                            variant='destructive'
                            onClick={() => {
                                useDeleteChargeDialogState
                                    .getState()
                                    .setChargeId(row.original.id)
                            }}
                        >
                            Delete
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            )
        },
    },
]
export function ChargesTable() {
    const openCreateDialog = useCreateDialogState((s) => s.toggle)
    const { data, fetch } = useInfo(
        useShallow((s) => ({
            data: s.charges,
            fetch: s.fetch,
        })),
    )
    const rowCount = data.length
    const [rowSelection, setRowSelection] = useState({})
    const [columnVisibility, setColumnVisibility] = useState<VisibilityState>(
        {},
    )
    const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
    const [sorting, setSorting] = useState<SortingState>([])
    const [pagination, setPagination] = useState({
        pageIndex: 0,
        pageSize: 20,
    })
    const { card_id } = useParams<{ card_id: string }>()
    useEffect(() => {
        if (card_id) {
            fetch(card_id)
        }
    }, [card_id, fetch])

    // eslint-disable-next-line react-hooks/incompatible-library
    const table = useReactTable({
        data,
        columns,
        rowCount,
        state: {
            sorting,
            columnVisibility,
            rowSelection,
            columnFilters,
            pagination,
        },
        getRowId: (row) => row.id.toString(),
        enableRowSelection: true,
        onRowSelectionChange: setRowSelection,
        onSortingChange: setSorting,
        onColumnFiltersChange: setColumnFilters,
        onColumnVisibilityChange: setColumnVisibility,
        onPaginationChange: setPagination,
        getCoreRowModel: getCoreRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFacetedRowModel: getFacetedRowModel(),
        getFacetedUniqueValues: getFacetedUniqueValues(),
    })
    return (
        <TableProvider table={table}>
            <DashboardTabs openCreateDialog={openCreateDialog} />
            <CreateChargeDialog />
            <EditChargeDialog />
            <DeleteChargeDialog />
        </TableProvider>
    )
}
