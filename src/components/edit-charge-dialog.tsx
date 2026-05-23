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
import { FormEvent, useRef, useState, useEffect } from 'react'
import { useEditChargeDialogState } from '@/stores/edit-charge.store'
import { useShallow } from 'zustand/shallow'
import { useInfo } from '@/stores/info.store'

export function EditChargeDialog() {
    const { open, charge, toggle } = useEditChargeDialogState(
        useShallow((state) => ({
            open: state.open,
            charge: state.charge,
            toggle: state.toggle,
        })),
    )
    const updateCharge = useInfo((s) => s.updateCharge)
    const formRef = useRef<HTMLFormElement>(null)
    const [errors, setErrors] = useState<{ name?: string; amount?: string }>({})

    useEffect(() => {
        if (charge && formRef.current) {
            const nameInput =
                formRef.current.querySelector<HTMLInputElement>('#edit-name')
            const amountInput =
                formRef.current.querySelector<HTMLInputElement>('#edit-amount')

            if (nameInput) nameInput.value = charge.name
            if (amountInput)
                amountInput.value = (charge.amount / 100).toFixed(2)
        }
    }, [charge, open])

    async function handleSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault()
        if (!charge) return

        const form = new FormData(e.currentTarget)
        const name = (form.get('name') as string)?.trim()
        const rawAmount = form.get('amount') as string
        const parsed = parseFloat(rawAmount)

        const newErrors: typeof errors = {}
        if (!name) newErrors.name = 'Name is required'
        if (isNaN(parsed) || parsed <= 0) newErrors.amount = 'Invalid amount'
        setErrors(newErrors)
        if (Object.keys(newErrors).length > 0) return

        await updateCharge(charge.id, name, parsed)
        setErrors({})
        toggle(false)
    }

    return (
        <Dialog open={open} onOpenChange={toggle}>
            <DialogContent className='sm:max-w-sm'>
                <form ref={formRef} onSubmit={handleSubmit}>
                    <DialogHeader>
                        <DialogTitle>Edit Charge</DialogTitle>
                        <DialogDescription>
                            Update the charge details.
                        </DialogDescription>
                    </DialogHeader>
                    <FieldGroup>
                        <Field>
                            <Label htmlFor='edit-name'>Name</Label>
                            <Input id='edit-name' name='name' />
                            {errors.name && (
                                <FieldError>{errors.name}</FieldError>
                            )}
                        </Field>
                        <Field>
                            <Label htmlFor='edit-amount'>Amount</Label>
                            <Input
                                id='edit-amount'
                                name='amount'
                                type='number'
                                step='0.01'
                                min={0}
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
