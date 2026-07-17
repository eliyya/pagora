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
import { useEditChargeDialogState } from '@/stores/edit-charge.store'
import { useShallow } from 'zustand/shallow'
import { useInfo } from '@/stores/info.store'
import { CurrencyInput } from './currency-input'
import type { Charge } from '@/db/generated/prisma/browser'

export function EditChargeDialog() {
    const { open, charge, toggle } = useEditChargeDialogState(
        useShallow((state) => ({
            open: state.open,
            charge: state.charge,
            toggle: state.toggle,
        })),
    )
    const updateCharge = useInfo((s) => s.updateCharge)
    return (
        <Dialog open={open} onOpenChange={toggle}>
            <DialogContent className='sm:max-w-sm'>
                {charge ? (
                    <EditChargeForm
                        key={charge.id}
                        charge={charge}
                        onSubmit={updateCharge}
                        onClose={() => toggle(false)}
                    />
                ) : null}
            </DialogContent>
        </Dialog>
    )
}

function EditChargeForm({
    charge,
    onSubmit,
    onClose,
}: {
    charge: Charge
    onSubmit: (id: string, name: string, amount: number) => Promise<void>
    onClose: () => void
}) {
    const [name, setName] = useState(charge.name)
    const [amountCents, setAmountCents] = useState(charge.amount)
    const [errors, setErrors] = useState<{ name?: string; amount?: string }>({})

    async function handleSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault()

        const trimmedName = name.trim()

        const newErrors: typeof errors = {}
        if (!trimmedName) newErrors.name = 'Name is required'
        if (amountCents <= 0) newErrors.amount = 'Invalid amount'
        setErrors(newErrors)
        if (Object.keys(newErrors).length > 0) return

        await onSubmit(charge.id, trimmedName, amountCents / 100)
        setErrors({})
        onClose()
    }

    return (
        <form onSubmit={handleSubmit}>
            <DialogHeader>
                <DialogTitle>Edit Charge</DialogTitle>
                <DialogDescription>Update the charge details.</DialogDescription>
            </DialogHeader>
            <FieldGroup>
                <Field>
                    <Label htmlFor='edit-name'>Name</Label>
                    <Input
                        id='edit-name'
                        name='name'
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                    />
                    {errors.name && <FieldError>{errors.name}</FieldError>}
                </Field>
                <Field>
                    <Label htmlFor='edit-amount'>Amount</Label>
                    <CurrencyInput
                        id='edit-amount'
                        name='amount'
                        valueCents={amountCents}
                        onValueCentsChange={setAmountCents}
                    />
                    {errors.amount && <FieldError>{errors.amount}</FieldError>}
                </Field>
            </FieldGroup>
            <DialogFooter>
                <DialogClose render={<Button variant='outline'>Cancel</Button>} />
                <Button type='submit'>Save changes</Button>
            </DialogFooter>
        </form>
    )
}
