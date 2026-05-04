'use client'

import {
    Dialog,
    DialogClose,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Field, FieldGroup } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useActionState, useEffect } from 'react'
import { chargueStore } from '@/stores/charges.store'
import { useShallow } from 'zustand/shallow'
import { DEFAULT_CREATE_CARD_VALUE } from '@/schemas/card.schema'
import { createCardFormAction } from '@/actions/card.action'
import { useCreateCardDialog } from '@/stores/card.store'

export function RegisterCardDialog() {
    const [state, action] = useActionState(createCardFormAction, {
        fields: DEFAULT_CREATE_CARD_VALUE,
        done: false,
    })
    const refresh = chargueStore(useShallow((state) => state.refresh))
    const { open, toggle } = useCreateCardDialog(
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
                                required
                                defaultValue={state.fields?.name ?? ''}
                            />
                        </Field>
                        <Field>
                            <Label htmlFor='bank-1'>Bank</Label>
                            <Input
                                id='bank-1'
                                name='bank'
                                defaultValue={state.fields?.bank ?? ''}
                            />
                        </Field>
                        <Field>
                            <Label htmlFor='bank-1'>Brand</Label>
                            <Input
                                id='brand-1'
                                name='brand'
                                defaultValue={state.fields?.brand ?? ''}
                            />
                        </Field>
                        <Field>
                            <Label htmlFor='last-4'>Last 4 Numbers</Label>
                            <Input
                                id='last-4'
                                name='last4'
                                type='text'
                                defaultValue={state.fields?.last4 ?? ''}
                            />
                        </Field>
                        <Field>
                            <Label htmlFor='closing-4'>Closing Day</Label>
                            <Input
                                id='closing-4'
                                name='closing_day'
                                type='number'
                                min={1}
                                max={31}
                                defaultValue={state.fields?.closing_day ?? ''}
                            />
                        </Field>
                        <Field>
                            <Label htmlFor='due-4'>Due Day</Label>
                            <Input
                                id='due-4'
                                name='due_day'
                                type='number'
                                min={1}
                                max={31}
                                defaultValue={state.fields?.due_day ?? ''}
                            />
                        </Field>
                        <Field>
                            <Label htmlFor='limit-4'>Credit Limit</Label>
                            <Input
                                id='limit-4'
                                name='credit_limit'
                                type='number'
                                defaultValue={state.fields?.credit_limit ?? ''}
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
