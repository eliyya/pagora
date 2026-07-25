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
import {
    isDateOnly,
    MAX_INSTALLMENT_COUNT,
    MIN_INSTALLMENT_COUNT,
} from '@/lib/installments'

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
            <DialogContent className='max-h-[90dvh] overflow-y-auto sm:max-w-sm'>
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
        installment?: {
            count: number
            firstInstallmentDate: string
        },
    ) => Promise<boolean>
    onClose: () => void
}) {
    const [name, setName] = useState(charge.name)
    const [amountCents, setAmountCents] = useState(charge.amount)
    const [categoryName, setCategoryName] = useState(charge.category?.name ?? '')
    const isInstallmentParent = charge.kind === 'installment_parent'
    const canEditInstallmentPlan = isInstallmentParent && charge.paid === 0
    const [installmentCount, setInstallmentCount] = useState(
        charge.installment_count ?? 2,
    )
    const [firstInstallmentDate, setFirstInstallmentDate] = useState(
        charge.scheduled_for.toISOString().slice(0, 10),
    )
    const categories = useInfo((s) => s.categories)
    const [errors, setErrors] = useState<{
        name?: string
        amount?: string
        installmentCount?: string
        firstInstallmentDate?: string
    }>({})
    const [saving, setSaving] = useState(false)

    async function handleSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault()
        if (saving) return

        const trimmedName = name.trim()

        const newErrors: typeof errors = {}
        if (!trimmedName) newErrors.name = 'Name is required'
        if (amountCents <= 0) newErrors.amount = 'Invalid amount'
        if (
            canEditInstallmentPlan &&
            (!Number.isInteger(installmentCount) ||
                installmentCount < MIN_INSTALLMENT_COUNT ||
                installmentCount > MAX_INSTALLMENT_COUNT)
        ) {
            newErrors.installmentCount =
                `Elige entre ${MIN_INSTALLMENT_COUNT} y ${MAX_INSTALLMENT_COUNT} meses`
        }
        if (
            canEditInstallmentPlan &&
            !isDateOnly(firstInstallmentDate)
        ) {
            newErrors.firstInstallmentDate =
                'La fecha de la primera mensualidad es requerida'
        }
        if (
            canEditInstallmentPlan &&
            amountCents > 0 &&
            amountCents < installmentCount
        ) {
            newErrors.amount =
                'El monto debe permitir al menos un centavo por mensualidad'
        }
        setErrors(newErrors)
        if (Object.keys(newErrors).length > 0) return

        setSaving(true)
        try {
            const saved = await onSubmit(
                charge.id,
                trimmedName,
                amountCents,
                categoryName,
                isInstallmentParent
                    ? {
                          count: installmentCount,
                          firstInstallmentDate,
                      }
                    : undefined,
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
                        disabled={isInstallmentParent && charge.paid > 0}
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
                {isInstallmentParent ? (
                    <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
                        <Field>
                            <Label htmlFor='edit-installment-count'>Meses</Label>
                            <Input
                                id='edit-installment-count'
                                name='installment-count'
                                type='number'
                                min={MIN_INSTALLMENT_COUNT}
                                max={MAX_INSTALLMENT_COUNT}
                                step={1}
                                value={installmentCount}
                                disabled={!canEditInstallmentPlan}
                                onChange={(event) =>
                                    setInstallmentCount(
                                        Number(event.target.value),
                                    )
                                }
                            />
                            {errors.installmentCount && (
                                <FieldError>
                                    {errors.installmentCount}
                                </FieldError>
                            )}
                        </Field>
                        <Field>
                            <Label htmlFor='edit-first-installment-date'>
                                Primera mensualidad
                            </Label>
                            <Input
                                id='edit-first-installment-date'
                                name='first-installment-date'
                                type='date'
                                value={firstInstallmentDate}
                                disabled={!canEditInstallmentPlan}
                                onChange={(event) =>
                                    setFirstInstallmentDate(event.target.value)
                                }
                            />
                            {errors.firstInstallmentDate && (
                                <FieldError>
                                    {errors.firstInstallmentDate}
                                </FieldError>
                            )}
                        </Field>
                        {!canEditInstallmentPlan ? (
                            <p className='col-span-2 text-xs text-muted-foreground'>
                                El monto, los meses y la fecha no se pueden
                                cambiar después de registrar un pago.
                            </p>
                        ) : null}
                    </div>
                ) : null}
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
