'use client'

import { chargeTableFeatures, type ChargeTableFeatures } from '@/lib/table-features'

import {
    ColumnDef,
    type RowData,
    ColumnFiltersState,
    SortingState,
    ColumnVisibilityState,
    flexRender,
    RowSelectionState,
    useTable,
} from '@tanstack/react-table'

import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import { Button } from './button'
import { Input } from './input'
import {
    DropdownMenu,
    DropdownMenuCheckboxItem,
    DropdownMenuContent,
    DropdownMenuTrigger,
} from './dropdown-menu'
import { useState } from 'react'
import { DataTablePagination } from '../data-table-pagination'
import { PlusIcon } from 'lucide-react'
import { useCreateDialogState } from '@/stores/charges.store'

interface DataTableProps<TData extends RowData> {
    columns: ColumnDef<ChargeTableFeatures, TData>[]
    data: TData[]
    rowCount?: number
}

export function DataTable<TData extends RowData>({
    columns,
    data,
    rowCount,
}: DataTableProps<TData>) {
    const setOpen = useCreateDialogState((s) => s.toggle)
    const [sorting, onSortingChange] = useState<SortingState>([])
    const [columnFilters, onColumnFiltersChange] = useState<ColumnFiltersState>(
        [],
    )
    const [columnVisibility, onColumnVisibilityChange] =
        useState<ColumnVisibilityState>({})
    const [rowSelection, onRowSelectionChange] = useState<RowSelectionState>({})

    const table = useTable({
        features: chargeTableFeatures,
        data,
        columns,
        rowCount,
        onSortingChange,
        onColumnFiltersChange,
        onColumnVisibilityChange,
        onRowSelectionChange,
        state: {
            sorting,
            columnFilters,
            columnVisibility,
            rowSelection,
        },
    })

    return (
        <div className='overflow-hidden rounded-md border px-4'>
            <div className='flex items-center justify-between gap-4 py-4'>
                <Input
                    placeholder='Filter chargue...'
                    value={
                        (table.getColumn('name')?.getFilterValue() as string) ??
                        ''
                    }
                    onChange={(event) =>
                        table
                            .getColumn('name')
                            ?.setFilterValue(event.target.value)
                    }
                    className='max-w-sm'
                />
                <DropdownMenu>
                    <DropdownMenuTrigger
                        render={
                            <Button variant='outline' className='ml-4'>
                                View
                            </Button>
                        }
                    />
                    <DropdownMenuContent align='end'>
                        {table
                            .getAllColumns()
                            .filter((column) => column.getCanHide())
                            .map((column) => (
                                <DropdownMenuCheckboxItem
                                    key={column.id}
                                    className={'capitalize'}
                                    checked={column.getIsVisible()}
                                    onCheckedChange={(value) =>
                                        column.toggleVisibility(!!value)
                                    }
                                >
                                    {column.id}
                                </DropdownMenuCheckboxItem>
                            ))}
                    </DropdownMenuContent>
                </DropdownMenu>
                <Button
                    disabled={false}
                    onClick={() => {
                        setOpen(true)
                    }}
                >
                    <PlusIcon />
                </Button>
            </div>
            <div className='overflow-hidden rounded-md border'>
                <Table>
                    <TableHeader>
                        {table.getHeaderGroups().map((headerGroup) => (
                            <TableRow key={headerGroup.id}>
                                {headerGroup.headers.map((header) => {
                                    return (
                                        <TableHead key={header.id}>
                                            {header.isPlaceholder
                                                ? null
                                                : flexRender(
                                                      header.column.columnDef
                                                          .header,
                                                      header.getContext(),
                                                  )}
                                        </TableHead>
                                    )
                                })}
                            </TableRow>
                        ))}
                    </TableHeader>
                    <TableBody>
                        {table.getRowModel().rows?.length ? (
                            table.getRowModel().rows.map((row) => (
                                <TableRow
                                    key={row.id}
                                    data-state={
                                        row.getIsSelected() && 'selected'
                                    }
                                >
                                    {row.getVisibleCells().map((cell) => (
                                        <TableCell key={cell.id}>
                                            {flexRender(
                                                cell.column.columnDef.cell,
                                                cell.getContext(),
                                            )}
                                        </TableCell>
                                    ))}
                                </TableRow>
                            ))
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
            </div>
            <DataTablePagination table={table} />
        </div>
    )
}
