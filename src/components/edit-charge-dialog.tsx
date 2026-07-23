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
import type { ChargeWithCategory } from '@/stores/info.store'

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
    charge: ChargeWithCategory
    onSubmit: (
        id: string,
        name: string,
        amount: number,
        categoryName?: string,
    ) => Promise<boolean>
    onClose: () => void
}) {
    const [name, setName] = useState(charge.name)
    const [amountCents, setAmountCents] = useState(charge.amount)
    const [categoryName, setCategoryName] = useState(charge.category?.name ?? '')
    const categories = useInfo((s) => s.categories)
    const [errors, setErrors] = useState<{ name?: string; amount?: string }>({})
    const [saving, setSaving] = useState(false)

    async function handleSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault()
        if (saving) return

        const trimmedName = name.trim()

        const newErrors: typeof errors = {}
        if (!trimmedName) newErrors.name = 'Name is required'
        if (amountCents <= 0) newErrors.amount = 'Invalid amount'
        setErrors(newErrors)
        if (Object.keys(newErrors).length > 0) return

        setSaving(true)
        try {
            const saved = await onSubmit(
                charge.id,
                trimmedName,
                amountCents,
                categoryName,
            )
            if (saved) {
                setErrors({})
                onClose()
            }
        } finally {
            setSaving(false)
        }
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
                        maxLength={500}
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
                <Field>
                    <Label htmlFor='edit-category'>Category</Label>
                    <Input
                        id='edit-category'
                        name='category'
                        list='edit-charge-categories'
                        maxLength={60}
                        value={categoryName}
                        onChange={(event) =>
                            setCategoryName(event.target.value)
                        }
                        placeholder='Breakfast, services, supplies...'
                    />
                    <datalist id='edit-charge-categories'>
                        {categories.map((category) => (
                            <option key={category.id} value={category.name} />
                        ))}
                    </datalist>
                </Field>
            </FieldGroup>
            <DialogFooter>
                <DialogClose
                    render={
                        <Button variant='outline' disabled={saving}>
                            Cancel
                        </Button>
                    }
                />
                <Button type='submit' disabled={saving}>
                    {saving ? 'Saving locally…' : 'Save changes'}
                </Button>
            </DialogFooter>
        </form>
    )
}
