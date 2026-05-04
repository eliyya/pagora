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
import { createChargueFormAction } from '@/actions/chargue.action'
import { DEFAULT_CREATE_CHARGE_VALUE } from '@/schemas/charge'
import { chargueStore, useCreateDialogState } from '@/stores/charges.store'
import { useShallow } from 'zustand/shallow'

export function CreateChargeDialog() {
    const [state, action] = useActionState(createChargueFormAction, {
        fields: DEFAULT_CREATE_CHARGE_VALUE,
        done: false,
    })
    const refresh = chargueStore(useShallow((state) => state.refresh))
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
