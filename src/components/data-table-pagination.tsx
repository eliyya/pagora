import { type Table } from '@tanstack/react-table'
import {
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select'
import { useInfo } from '@/stores/info.store'
import { useEffect } from 'react'

interface DataTablePaginationProps<TData> {
    table: Table<TData>
}

export function DataTablePagination<TData>({
    table,
}: DataTablePaginationProps<TData>) {
    const pageSize = useInfo((state) => state.pageSize)
    const setPageSize = useInfo((state) => state.setPageSize)

    // Validate and correct the store's pageSize if needed
    useEffect(() => {
        if (![10, 20, 25, 30, 40, 50].includes(pageSize)) {
            setPageSize(10)
        }
    }, [pageSize, setPageSize])

    // Sync the table's pageSize to the store's pageSize
    useEffect(() => {
        table.setPageSize(pageSize)
    }, [pageSize, table])

    return (
        <div className='flex items-center justify-between w-full gap-2 py-2'>
            {/* <div className='flex-1 text-sm text-muted-foreground ml-2'>
                {table.getSelectedRowModel().rows.length} of{' '}
                {table.getFilteredRowModel().rows.length} row(s) selected.
            </div> */}
            <div className='flex w-full items-center space-x-6 lg:space-x-8'>
                <div className='flex items-center gap-2'>
                    <div className='flex items-center gap-2'>
                        <p className='text-sm font-medium'>Rows per page</p>
                        <Select
                            value={`${pageSize}`}
                            onValueChange={(value) => {
                                setPageSize(Number(value))
                            }}
                        >
                            <SelectTrigger className='h-8 w-15'>
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent side='top'>
                                {[10, 20, 25, 30, 40, 50].map((pageSize) => (
                                    <SelectItem
                                        key={pageSize}
                                        value={`${pageSize}`}
                                    >
                                        {pageSize}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className='flex w-20 items-center justify-center text-sm font-medium'>
                        Page {table.getState().pagination.pageIndex + 1} of{' '}
                        {table.getPageCount()}
                    </div>
                    <Button
                        variant='outline'
                        size='icon'
                        className='hidden size-8 lg:flex'
                        onClick={() => table.setPageIndex(0)}
                        disabled={!table.getCanPreviousPage()}
                    >
                        <span className='sr-only'>Go to first page</span>
                        <ChevronsLeft />
                    </Button>
                    <Button
                        variant='outline'
                        size='icon'
                        className='size-8'
                        onClick={() => table.previousPage()}
                        disabled={!table.getCanPreviousPage()}
                    >
                        <span className='sr-only'>Go to previous page</span>
                        <ChevronLeft />
                    </Button>
                    <Button
                        variant='outline'
                        size='icon'
                        className='size-8'
                        onClick={() => table.nextPage()}
                        disabled={!table.getCanNextPage()}
                    >
                        <span className='sr-only'>Go to next page</span>
                        <ChevronRight />
                    </Button>
                    <Button
                        variant='outline'
                        size='icon'
                        className='hidden size-8 lg:flex'
                        onClick={() =>
                            table.setPageIndex(table.getPageCount() - 1)
                        }
                        disabled={!table.getCanNextPage()}
                    >
                        <span className='sr-only'>Go to last page</span>
                        <ChevronsRight />
                    </Button>
                </div>
            </div>
        </div>
    )
}
