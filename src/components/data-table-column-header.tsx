import type { ChargeTableFeatures } from '@/lib/table-features'
import { type Column, type RowData } from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ChevronsUpDown, EyeOff } from 'lucide-react'

import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface DataTableColumnHeaderProps<
    TData extends RowData,
    TValue,
> extends React.HTMLAttributes<HTMLDivElement> {
    column: Column<ChargeTableFeatures, TData, TValue>
    title: string
}

export function DataTableColumnHeader<TData extends RowData, TValue>({
    column,
    title,
    className,
    left = false,
}: DataTableColumnHeaderProps<TData, TValue> & { left?: boolean }) {
    if (!column.getCanSort()) {
        return <div className={cn(className)}>{title}</div>
    }

    return (
        <div
            className={cn(
                'flex items-center gap-2',
                {
                    'justify-end': left,
                },
                className,
            )}
        >
            <DropdownMenu>
                <DropdownMenuTrigger
                    render={
                        <Button
                            variant='ghost'
                            size='sm'
                            className='-ml-3 h-8 data-[state=open]:bg-accent'
                        >
                            <span>{title}</span>
                            {column.getIsSorted() === 'desc' ? (
                                <ArrowDown />
                            ) : column.getIsSorted() === 'asc' ? (
                                <ArrowUp />
                            ) : (
                                <ChevronsUpDown />
                            )}
                        </Button>
                    }
                ></DropdownMenuTrigger>
                <DropdownMenuContent align='start'>
                    <DropdownMenuItem
                        onClick={() => column.toggleSorting(false)}
                    >
                        <ArrowUp />
                        Asc
                    </DropdownMenuItem>
                    <DropdownMenuItem
                        onClick={() => column.toggleSorting(true)}
                    >
                        <ArrowDown />
                        Desc
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                        onClick={() => column.toggleVisibility(false)}
                    >
                        <EyeOff />
                        Hide
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    )
}
