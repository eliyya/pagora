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
import { ComponentProps, useActionState, useEffect } from 'react'
import { useShallow } from 'zustand/shallow'
import { DEFAULT_CREATE_CARD_VALUE } from '@/schemas/card.schema'
import { createCardFormAction } from '@/actions/card.action'
import { useCreateCardDialog } from '@/stores/card.store'
import { useRouter } from 'next/navigation'
export function RegisterCardDialog(props: ComponentProps<typeof Dialog>) {
    const [state, action] = useActionState(createCardFormAction, {
        fields: DEFAULT_CREATE_CARD_VALUE,
        done: false,
    })
    const { open, toggle } = useCreateCardDialog(
        useShallow((state) => ({
            open: state.open,
            toggle: state.toggle,
        })),
    )
    const { push } = useRouter()

    useEffect(() => {
        if (state.done) {
            queueMicrotask(() => {
                toggle(false)
                push(`/dashboard/card/${state.lastCardId}`)
            })
        }
    }, [state.done, toggle, state, push])

    return (
        <Dialog open={open} onOpenChange={toggle} {...props}>
            <DialogContent className='sm:max-w-sm'>
                <form action={action}>
                    <DialogHeader>
                        <DialogTitle>New Card</DialogTitle>
                        <DialogDescription>
                            Registe a new card.
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
                            {state.fieldErrors?.name?.map((e, i) => (
                                <FieldError key={i}>{e}</FieldError>
                            ))}
                        </Field>
                        <Field>
                            <Label htmlFor='bank-1'>Bank</Label>
                            <Input
                                id='bank-1'
                                name='bank'
                                defaultValue={state.fields?.bank ?? ''}
                            />
                            {state.fieldErrors?.bank?.map((e, i) => (
                                <FieldError key={i}>{e}</FieldError>
                            ))}
                        </Field>
                        <Field>
                            <Label htmlFor='bank-1'>Brand</Label>
                            <Input
                                id='brand-1'
                                name='brand'
                                defaultValue={state.fields?.brand ?? ''}
                            />
                            {state.fieldErrors?.brand?.map((e, i) => (
                                <FieldError key={i}>{e}</FieldError>
                            ))}
                        </Field>
                        <Field>
                            <Label htmlFor='last-4'>Last 4 Numbers</Label>
                            <Input
                                id='last-4'
                                name='last4'
                                type='text'
                                defaultValue={state.fields?.last4 ?? ''}
                            />
                            {state.fieldErrors?.last4?.map((e, i) => (
                                <FieldError key={i}>{e}</FieldError>
                            ))}
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
                            {state.fieldErrors?.closing_day?.map((e, i) => (
                                <FieldError key={i}>{e}</FieldError>
                            ))}
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
                            {state.fieldErrors?.due_day?.map((e, i) => (
                                <FieldError key={i}>{e}</FieldError>
                            ))}
                        </Field>
                        <Field>
                            <Label htmlFor='limit-4'>Credit Limit</Label>
                            <Input
                                id='limit-4'
                                name='credit_limit'
                                type='number'
                                defaultValue={state.fields?.credit_limit ?? ''}
                            />
                            {state.fieldErrors?.credit_limit?.map((e, i) => (
                                <FieldError key={i}>{e}</FieldError>
                            ))}
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
