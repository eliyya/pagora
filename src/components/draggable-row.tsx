'use client'

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { flexRender, type Row } from '@tanstack/react-table'
import { TableCell, TableRow } from '@/components/ui/table'
import type { ChargeWithCategory } from '@/stores/info.store'

export function DraggableRow({
    row,
}: Readonly<{ row: Row<ChargeWithCategory> }>) {
    const { transform, transition, setNodeRef, isDragging } = useSortable({
        id: row.original.id,
    })
    return (
        <TableRow
            data-state={row.getIsSelected() && 'selected'}
            data-dragging={isDragging}
            ref={setNodeRef}
            className={`relative z-0 data-[dragging=true]:z-10 data-[dragging=true]:opacity-80 ${
                row.original.kind === 'installment_parent'
                    ? 'bg-muted/50'
                    : row.original.kind === 'installment'
                      ? 'border-l-2 border-l-primary/30 bg-muted/15'
                      : ''
            }`}
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
