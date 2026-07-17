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
import { FormEvent, useState } from 'react'
import { useCreateDialogState } from '@/stores/charges.store'
import { useShallow } from 'zustand/shallow'
import { useInfo } from '@/stores/info.store'
import { CurrencyInput } from './currency-input'

export function CreateChargeDialog() {
    const { open, toggle } = useCreateDialogState(
        useShallow((state) => ({
            open: state.open,
            toggle: state.toggle,
        })),
    )
    const createCharge = useInfo((s) => s.createCharge)
    const [name, setName] = useState('')
    const [amountCents, setAmountCents] = useState(0)
    const [errors, setErrors] = useState<{ name?: string; amount?: string }>({})

    function resetForm() {
        setName('')
        setAmountCents(0)
        setErrors({})
    }

    function handleOpenChange(nextOpen: boolean) {
        if (!nextOpen) resetForm()
        toggle(nextOpen)
    }

    async function handleSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault()
        const trimmedName = name.trim()

        const newErrors: typeof errors = {}
        if (!trimmedName) newErrors.name = 'Name is required'
        if (amountCents <= 0) newErrors.amount = 'Invalid amount'
        setErrors(newErrors)
        if (Object.keys(newErrors).length > 0) return

        await createCharge(amountCents / 100, trimmedName)
        resetForm()
        handleOpenChange(false)
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className='sm:max-w-sm'>
                <form onSubmit={handleSubmit}>
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
                                value={name}
                                onChange={(event) =>
                                    setName(event.target.value)
                                }
                            />
                            {errors.name && (
                                <FieldError>{errors.name}</FieldError>
                            )}
                        </Field>
                        <Field>
                            <Label htmlFor='username-1'>Amount</Label>
                            <CurrencyInput
                                id='username-1'
                                name='amount'
                                valueCents={amountCents}
                                onValueCentsChange={setAmountCents}
                            />
                            {errors.amount && (
                                <FieldError>{errors.amount}</FieldError>
                            )}
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
