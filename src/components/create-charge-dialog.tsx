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
import { FormEvent, useRef, useState } from 'react'
import { useCreateDialogState } from '@/stores/charges.store'
import { useShallow } from 'zustand/shallow'
import { useInfo } from '@/stores/info.store'

export function CreateChargeDialog() {
    const { open, toggle } = useCreateDialogState(
        useShallow((state) => ({
            open: state.open,
            toggle: state.toggle,
        })),
    )
    const createCharge = useInfo((s) => s.createCharge)
    const formRef = useRef<HTMLFormElement>(null)
    const [errors, setErrors] = useState<{ name?: string; amount?: string }>({})

    async function handleSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault()
        const form = new FormData(e.currentTarget)
        const name = (form.get('name') as string)?.trim()
        const rawAmount = form.get('amount') as string
        const parsed = parseFloat(rawAmount)

        const newErrors: typeof errors = {}
        if (!name) newErrors.name = 'Name is required'
        if (isNaN(parsed) || parsed <= 0) newErrors.amount = 'Invalid amount'
        setErrors(newErrors)
        if (Object.keys(newErrors).length > 0) return

        const amount = Math.round(parsed * 100)
        await createCharge(amount, name)
        formRef.current?.reset()
        setErrors({})
        toggle(false)
    }

    return (
        <Dialog open={open} onOpenChange={toggle}>
            <DialogContent className='sm:max-w-sm'>
                <form ref={formRef} onSubmit={handleSubmit}>
                    <DialogHeader>
                        <DialogTitle>New Charge</DialogTitle>
                        <DialogDescription>
                            Create a new chargue into the credit card.
                        </DialogDescription>
                    </DialogHeader>
                    <FieldGroup>
                        <Field>
                            <Label htmlFor='name-1'>Name</Label>
                            <Input id='name-1' name='name' />
                            {errors.name && (
                                <FieldError>{errors.name}</FieldError>
                            )}
                        </Field>
                        <Field>
                            <Label htmlFor='username-1'>Amount</Label>
                            <Input
                                id='username-1'
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
