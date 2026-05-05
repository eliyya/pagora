'use client'

import { MoreHorizontalIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuGroup,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ColumnDef } from '@tanstack/react-table'
import { Checkbox } from '@/components/ui/checkbox'
import { DataTableColumnHeader } from '@/components/data-table-column-header'
import { Charge } from '@/db/generated/prisma/browser'
import { DataTable } from '@/components/ui/data-table'

import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldGroup } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useActionState, useEffect } from 'react'
import { createChargueFormAction } from '@/actions/chargue.action'
import { DEFAULT_CREATE_CHARGE_VALUE } from '@/schemas/charge'
import { useCreateDialogState } from '@/stores/charges.store'
import { useShallow } from 'zustand/shallow'
import { useCards } from '@/stores/card.store'

export const columns: ColumnDef<Charge>[] = [
    {
        id: 'select',
        header: ({ table }) => (
            <Checkbox
                indeterminate={
                    !table.getIsAllPageRowsSelected() &&
                    table.getIsSomePageRowsSelected()
                }
                checked={table.getIsAllPageRowsSelected()}
                onCheckedChange={(value) =>
                    table.toggleAllPageRowsSelected(!!value)
                }
                aria-label='Select all'
            />
        ),
        cell: ({ row }) => (
            <Checkbox
                checked={row.getIsSelected()}
                onCheckedChange={(value) => row.toggleSelected(!!value)}
                aria-label='Selected row'
            />
        ),
        enableSorting: false,
        enableHiding: false,
    },
    {
        accessorKey: 'amount',
        header: ({ column }) => (
            <DataTableColumnHeader left column={column} title='Amount' />
        ),
        // header: () => <div className='text-right'>Amount</div>,
        cell: ({ row }) => {
            const amount = parseFloat(row.getValue('amount'))
            const formatted = new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD',
            }).format(amount / 100)

            return (
                <div className='text-right font-medium pr-3'>{formatted}</div>
            )
        },
    },
    {
        accessorKey: 'name',
        header: 'Name',
    },
    {
        accessorKey: 'created_at',
        cell: ({ getValue }) =>
            Intl.DateTimeFormat('es').format(getValue() as Date),
        header: ({ column }) => (
            <DataTableColumnHeader column={column} title='Date' />
        ),
    },
    {
        id: 'actions',
        cell: ({ row }) => {
            const payment = row.original

            return (
                <DropdownMenu>
                    <DropdownMenuTrigger
                        render={
                            <Button variant='ghost' className='h-8 w-8 p-0'>
                                <span className='sr-only'>Open menu</span>
                                <MoreHorizontalIcon className='h-4 w-4' />
                            </Button>
                        }
                    ></DropdownMenuTrigger>
                    <DropdownMenuContent align='end'>
                        <DropdownMenuGroup>
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem
                                onClick={() =>
                                    navigator.clipboard.writeText(payment.id)
                                }
                            >
                                Copy ID
                            </DropdownMenuItem>
                        </DropdownMenuGroup>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem>View customer</DropdownMenuItem>
                        <DropdownMenuItem>
                            View payment details
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            )
        },
        enableSorting: false,
        enableHiding: false,
    },
]

export function ChargesTable() {
    const { total, data } = useCards(
        useShallow((s) => ({
            total: s.chargesCount,
            data: s.charges,
        })),
    )

    return (
        <>
            <DataTable rowCount={total} data={data} columns={columns} />
            <DialogDemo />
        </>
    )
}

export function DialogDemo() {
    const [state, action] = useActionState(createChargueFormAction, {
        fields: DEFAULT_CREATE_CHARGE_VALUE,
        done: false,
    })

    const { refresh } = useCards(
        useShallow((s) => ({
            refresh: s.refreshCharges,
        })),
    )
    const { open, toggle } = useCreateDialogState(
        useShallow((state) => ({
            open: state.open,
            toggle: state.toggle,
        })),
    )

    useEffect(() => {
        if (state.done) {
            queueMicrotask(() => {
                toggle(false)
                refresh()
            })
        }
    }, [state.done, refresh, toggle])

    return (
        <Dialog open={open} onOpenChange={toggle}>
            <DialogContent className='sm:max-w-sm'>
                <form action={action}>
                    <DialogHeader>
                        <DialogTitle>New Charge</DialogTitle>
                        <DialogDescription>
                            Create a new chargue into the credit card.
                        </DialogDescription>
                    </DialogHeader>
                    <FieldGroup>
                        <Field>
                            <Label htmlFor='name-1'>Name</Label>
                            <Input
                                id='name-1'
                                name='name'
                                defaultValue={state.fields?.name ?? ''}
                            />
                        </Field>
                        <Field>
                            <Label htmlFor='username-1'>Amount</Label>
                            <Input
                                id='username-1'
                                name='amount'
                                type='number'
                                step='0.01'
                                min={0}
                                defaultValue={state.fields?.amount ?? ''}
                            />
                        </Field>
                    </FieldGroup>
                    <DialogFooter>
                        <DialogClose
                            render={<Button variant='outline'>Cancel</Button>}
                        />
                        <Button type='submit'>Save changes</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
