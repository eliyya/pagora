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
import { Field, FieldError, FieldGroup } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useActionState, useEffect } from 'react'
import { createChargueFormAction } from '@/actions/chargue.action'
import { DEFAULT_CREATE_CHARGE_VALUE } from '@/schemas/charge'
import { useCreateDialogState } from '@/stores/charges.store'
import { useShallow } from 'zustand/shallow'
import { useParams } from 'next/navigation'
import { useCards } from '@/stores/card.store'

export function CreateChargeDialog() {
    const params = useParams<{ card_id: string }>()
    const [state, action] = useActionState(createChargueFormAction, {
        fields: DEFAULT_CREATE_CHARGE_VALUE,
        done: false,
    })
    const refresh = useCards(useShallow((state) => state.refreshCharges))
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
                            {state.errors?.name?.map((e, i) => (
                                <FieldError key={i}>{e}</FieldError>
                            ))}
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
                            {state.errors?.amount?.map((e, i) => (
                                <FieldError key={i}>{e}</FieldError>
                            ))}
                        </Field>
                    </FieldGroup>
                    <input
                        type='hidden'
                        name='card_id'
                        value={params.card_id}
                    />
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
