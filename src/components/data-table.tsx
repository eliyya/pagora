'use client'

import {
    closestCenter,
    DndContext,
    KeyboardSensor,
    MouseSensor,
    TouchSensor,
    useSensor,
    useSensors,
    type UniqueIdentifier,
} from '@dnd-kit/core'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import {
    SortableContext,
    useSortable,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
    flexRender,
    getCoreRowModel,
    getFacetedRowModel,
    getFacetedUniqueValues,
    getFilteredRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    useReactTable,
    type ColumnDef,
    type ColumnFiltersState,
    type Row,
    type SortingState,
    type VisibilityState,
} from '@tanstack/react-table'
import { z } from 'zod'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
    CircleCheckIcon,
    LoaderIcon,
    EllipsisVerticalIcon,
    Columns3Icon,
    ChevronDownIcon,
    PlusIcon,
    ChevronsLeftIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
    ChevronsRightIcon,
} from 'lucide-react'
import { DataTableColumnHeader } from './data-table-column-header'
import { useCreateDialogState } from '@/stores/charges.store'
import { Charge } from '@/db/generated/prisma/browser'
import { CreateChargeDialog } from './create-charge-dialog'
import { useId, useMemo, useState } from 'react'
import { useInfo } from '@/stores/info.store'
import { ChartAreaInteractive } from './chart-area-interactive'

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
                        <DropdownMenuItem>Edit</DropdownMenuItem>
                        <DropdownMenuItem>Make a copy</DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem variant='destructive'>
                            Delete
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            )
        },
    },
]
function DraggableRow({ row }: Readonly<{ row: Row<Charge> }>) {
    const { transform, transition, setNodeRef, isDragging } = useSortable({
        id: row.original.id,
    })
    return (
        <TableRow
            data-state={row.getIsSelected() && 'selected'}
            data-dragging={isDragging}
            ref={setNodeRef}
            className='relative z-0 data-[dragging=true]:z-10 data-[dragging=true]:opacity-80'
            style={{
                transform: CSS.Transform.toString(transform),
                transition: transition,
            }}
        >
            {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </TableCell>
            ))}
        </TableRow>
    )
}
export function ChargesTable() {
    const openCreateDialog = useCreateDialogState((s) => s.toggle)
    const data = useInfo((s) => s.charges)
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
    const sortableId = useId()
    const sensors = useSensors(
        useSensor(MouseSensor, {}),
        useSensor(TouchSensor, {}),
        useSensor(KeyboardSensor, {}),
    )
    const dataIds = useMemo<UniqueIdentifier[]>(
        () => data?.map(({ id }) => id) || [],
        [data],
    )

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
        <>
            <Tabs
                defaultValue='outline'
                className='w-full flex-col justify-start gap-6'
            >
                <div className='flex items-center justify-between px-4 lg:px-6'>
                    <Label htmlFor='view-selector' className='sr-only'>
                        View
                    </Label>
                    <Select
                        defaultValue='outline'
                        items={[
                            { label: 'Outline', value: 'outline' },
                            {
                                label: 'Past Performance',
                                value: 'past-performance',
                            },
                            { label: 'Key Personnel', value: 'key-personnel' },
                            {
                                label: 'Focus Documents',
                                value: 'focus-documents',
                            },
                        ]}
                    >
                        <SelectTrigger
                            className='flex w-fit @4xl/main:hidden'
                            size='sm'
                            id='view-selector'
                        >
                            <SelectValue placeholder='Select a view' />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectGroup>
                                <SelectItem value='outline'>Outline</SelectItem>
                                <SelectItem value='past-performance'>
                                    Past Performance
                                </SelectItem>
                                <SelectItem value='key-personnel'>
                                    Key Personnel
                                </SelectItem>
                                <SelectItem value='focus-documents'>
                                    Focus Documents
                                </SelectItem>
                            </SelectGroup>
                        </SelectContent>
                    </Select>
                    <Input
                        placeholder='Filter chargue...'
                        value={
                            (table
                                .getColumn('name')
                                ?.getFilterValue() as string) ?? ''
                        }
                        onChange={(event) =>
                            table
                                .getColumn('name')
                                ?.setFilterValue(event.target.value)
                        }
                        className='max-w-sm'
                    />
                    <TabsList className='hidden **:data-[slot=badge]:size-5 **:data-[slot=badge]:rounded-full **:data-[slot=badge]:bg-muted-foreground/30 **:data-[slot=badge]:px-1 @4xl/main:flex'>
                        <TabsTrigger value='outline'>Chargues</TabsTrigger>
                        <TabsTrigger value='past-performance'>
                            Graph
                        </TabsTrigger>
                        <TabsTrigger value='key-personnel'>
                            Key Personnel <Badge variant='secondary'>2</Badge>
                        </TabsTrigger>
                        <TabsTrigger value='focus-documents'>
                            Focus Documents
                        </TabsTrigger>
                    </TabsList>
                    <div className='flex items-center gap-2'>
                        <DropdownMenu>
                            <DropdownMenuTrigger
                                render={<Button variant='outline' size='sm' />}
                            >
                                <Columns3Icon data-icon='inline-start' />
                                Columns
                                <ChevronDownIcon data-icon='inline-end' />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align='end' className='w-32'>
                                {table
                                    .getAllColumns()
                                    .filter(
                                        (column) =>
                                            column.accessorFn === undefined &&
                                            column.getCanHide(),
                                    )
                                    .map((column) => {
                                        return (
                                            <DropdownMenuCheckboxItem
                                                key={column.id}
                                                className='capitalize'
                                                checked={column.getIsVisible()}
                                                onCheckedChange={(value) =>
                                                    column.toggleVisibility(
                                                        !!value,
                                                    )
                                                }
                                            >
                                                {column.id}
                                            </DropdownMenuCheckboxItem>
                                        )
                                    })}
                            </DropdownMenuContent>
                        </DropdownMenu>
                        <Button
                            variant='default'
                            size='sm'
                            onClick={() => openCreateDialog(true)}
                        >
                            <PlusIcon />
                            <span className='hidden lg:inline'>
                                Create Charge
                            </span>
                        </Button>
                    </div>
                </div>
                <TabsContent
                    value='outline'
                    className='relative flex flex-col gap-4 overflow-auto px-4 lg:px-6'
                >
                    <div className='overflow-hidden rounded-lg border'>
                        <DndContext
                            collisionDetection={closestCenter}
                            modifiers={[restrictToVerticalAxis]}
                            sensors={sensors}
                            id={sortableId}
                        >
                            <Table>
                                <TableHeader className='sticky top-0 z-10 bg-muted'>
                                    {table
                                        .getHeaderGroups()
                                        .map((headerGroup) => (
                                            <TableRow key={headerGroup.id}>
                                                {headerGroup.headers.map(
                                                    (header) => {
                                                        return (
                                                            <TableHead
                                                                key={header.id}
                                                                colSpan={
                                                                    header.colSpan
                                                                }
                                                            >
                                                                {header.isPlaceholder
                                                                    ? null
                                                                    : flexRender(
                                                                          header
                                                                              .column
                                                                              .columnDef
                                                                              .header,
                                                                          header.getContext(),
                                                                      )}
                                                            </TableHead>
                                                        )
                                                    },
                                                )}
                                            </TableRow>
                                        ))}
                                </TableHeader>
                                <TableBody className='**:data-[slot=table-cell]:first:w-8'>
                                    {table.getRowModel().rows?.length ? (
                                        <SortableContext
                                            items={dataIds}
                                            strategy={
                                                verticalListSortingStrategy
                                            }
                                        >
                                            {table
                                                .getRowModel()
                                                .rows.map((row) => (
                                                    <DraggableRow
                                                        key={row.id}
                                                        row={row}
                                                    />
                                                ))}
                                        </SortableContext>
                                    ) : (
                                        <TableRow>
                                            <TableCell
                                                colSpan={columns.length}
                                                className='h-24 text-center'
                                            >
                                                No results.
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                        </DndContext>
                    </div>
                    <div className='flex items-center justify-between px-4'>
                        <div className='hidden flex-1 text-sm text-muted-foreground lg:flex'>
                            {table.getFilteredSelectedRowModel().rows.length} of{' '}
                            {table.getFilteredRowModel().rows.length} row(s)
                            selected.
                        </div>
                        <div className='flex w-full items-center gap-8 lg:w-fit'>
                            <div className='hidden items-center gap-2 lg:flex'>
                                <Label
                                    htmlFor='rows-per-page'
                                    className='text-sm font-medium'
                                >
                                    Rows per page
                                </Label>
                                <Select
                                    value={`${table.getState().pagination.pageSize}`}
                                    onValueChange={(value) => {
                                        table.setPageSize(Number(value))
                                    }}
                                    items={[20, 30, 40, 50, 100].map(
                                        (pageSize) => ({
                                            label: `${pageSize}`,
                                            value: `${pageSize}`,
                                        }),
                                    )}
                                >
                                    <SelectTrigger
                                        size='sm'
                                        className='w-20'
                                        id='rows-per-page'
                                    >
                                        <SelectValue
                                            placeholder={
                                                table.getState().pagination
                                                    .pageSize
                                            }
                                        />
                                    </SelectTrigger>
                                    <SelectContent side='top'>
                                        <SelectGroup>
                                            {[20, 30, 40, 50, 100].map(
                                                (pageSize) => (
                                                    <SelectItem
                                                        key={pageSize}
                                                        value={`${pageSize}`}
                                                    >
                                                        {pageSize}
                                                    </SelectItem>
                                                ),
                                            )}
                                        </SelectGroup>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className='flex w-fit items-center justify-center text-sm font-medium'>
                                Page {table.getState().pagination.pageIndex + 1}{' '}
                                of {table.getPageCount()}
                            </div>
                            <div className='ml-auto flex items-center gap-2 lg:ml-0'>
                                <Button
                                    variant='outline'
                                    className='hidden h-8 w-8 p-0 lg:flex'
                                    onClick={() => table.setPageIndex(0)}
                                    disabled={!table.getCanPreviousPage()}
                                >
                                    <span className='sr-only'>
                                        Go to first page
                                    </span>
                                    <ChevronsLeftIcon />
                                </Button>
                                <Button
                                    variant='outline'
                                    className='size-8'
                                    size='icon'
                                    onClick={() => table.previousPage()}
                                    disabled={!table.getCanPreviousPage()}
                                >
                                    <span className='sr-only'>
                                        Go to previous page
                                    </span>
                                    <ChevronLeftIcon />
                                </Button>
                                <Button
                                    variant='outline'
                                    className='size-8'
                                    size='icon'
                                    onClick={() => table.nextPage()}
                                    disabled={!table.getCanNextPage()}
                                >
                                    <span className='sr-only'>
                                        Go to next page
                                    </span>
                                    <ChevronRightIcon />
                                </Button>
                                <Button
                                    variant='outline'
                                    className='hidden size-8 lg:flex'
                                    size='icon'
                                    onClick={() =>
                                        table.setPageIndex(
                                            table.getPageCount() - 1,
                                        )
                                    }
                                    disabled={!table.getCanNextPage()}
                                >
                                    <span className='sr-only'>
                                        Go to last page
                                    </span>
                                    <ChevronsRightIcon />
                                </Button>
                            </div>
                        </div>
                    </div>
                </TabsContent>
                <TabsContent
                    value='past-performance'
                    className='flex flex-col px-4 lg:px-6'
                >
                    <ChartAreaInteractive />
                </TabsContent>
                <TabsContent
                    value='key-personnel'
                    className='flex flex-col px-4 lg:px-6'
                >
                    <div className='aspect-video w-full flex-1 rounded-lg border border-dashed'></div>
                </TabsContent>
                <TabsContent
                    value='focus-documents'
                    className='flex flex-col px-4 lg:px-6'
                >
                    <div className='aspect-video w-full flex-1 rounded-lg border border-dashed'></div>
                </TabsContent>
            </Tabs>
            <CreateChargeDialog />
        </>
    )
}
