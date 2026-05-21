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
    verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
    ChevronsLeftIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
    ChevronsRightIcon,
} from 'lucide-react'
import { flexRender } from '@tanstack/react-table'
import { useId, useMemo } from 'react'
import { DraggableRow } from './draggable-row'
import { useTableContext } from './table-context'

export function ChargesDataTable() {
    const table = useTableContext()
    const sortableId = useId()
    const sensors = useSensors(
        useSensor(MouseSensor, {}),
        useSensor(TouchSensor, {}),
        useSensor(KeyboardSensor, {}),
    )
    const data = table.options.data
    const dataIds = useMemo<UniqueIdentifier[]>(
        () => data?.map(({ id }) => id) || [],
        [data],
    )

    return (
        <div className='relative flex flex-col gap-4 overflow-auto px-4 lg:px-6'>
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
                                        colSpan={table.getAllColumns().length}
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
                        Page {table.getState().pagination.pageIndex + 1} of{' '}
                        {table.getPageCount()}
                    </div>
                    <div className='ml-auto flex items-center gap-2 lg:ml-0'>
                        <Button
                            variant='outline'
                            className='hidden h-8 w-8 p-0 lg:flex'
                            onClick={() => table.setPageIndex(0)}
                            disabled={!table.getCanPreviousPage()}
                        >
                            <span className='sr-only'>First page</span>
                            <ChevronsLeftIcon />
                        </Button>
                        <Button
                            variant='outline'
                            className='size-8'
                            size='icon'
                            onClick={() => table.previousPage()}
                            disabled={!table.getCanPreviousPage()}
                        >
                            <span className='sr-only'>Previous page</span>
                            <ChevronLeftIcon />
                        </Button>
                        <Button
                            variant='outline'
                            className='size-8'
                            size='icon'
                            onClick={() => table.nextPage()}
                            disabled={!table.getCanNextPage()}
                        >
                            <span className='sr-only'>Next page</span>
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
                            <span className='sr-only'>Last page</span>
                            <ChevronsRightIcon />
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    )
}
