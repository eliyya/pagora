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
import { Checkbox } from '@/components/ui/checkbox'
import {
    isDateOnly,
    MAX_INSTALLMENT_COUNT,
    MIN_INSTALLMENT_COUNT,
} from '@/lib/installments'

export function CreateChargeDialog() {
    const { open, toggle } = useCreateDialogState(
        useShallow((state) => ({
            open: state.open,
            toggle: state.toggle,
        })),
    )
    const createCharge = useInfo((s) => s.createCharge)
    const categories = useInfo((s) => s.categories)
    const [name, setName] = useState('')
    const [amountCents, setAmountCents] = useState(0)
    const [categoryName, setCategoryName] = useState('')
    const [installmentsEnabled, setInstallmentsEnabled] = useState(false)
    const [installmentCount, setInstallmentCount] = useState(2)
    const [firstInstallmentDate, setFirstInstallmentDate] = useState('')
    const [errors, setErrors] = useState<{
        name?: string
        amount?: string
        installmentCount?: string
        firstInstallmentDate?: string
    }>({})
    const [saving, setSaving] = useState(false)

    function resetForm() {
        setName('')
        setAmountCents(0)
        setCategoryName('')
        setInstallmentsEnabled(false)
        setInstallmentCount(2)
        setFirstInstallmentDate('')
        setErrors({})
    }

    function handleOpenChange(nextOpen: boolean) {
        if (!nextOpen) resetForm()
        toggle(nextOpen)
    }

    async function handleSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault()
        if (saving) return
        const trimmedName = name.trim()

        const newErrors: typeof errors = {}
        if (!trimmedName) newErrors.name = 'Name is required'
        if (amountCents <= 0) newErrors.amount = 'Invalid amount'
        if (
            installmentsEnabled &&
            (!Number.isInteger(installmentCount) ||
                installmentCount < MIN_INSTALLMENT_COUNT ||
                installmentCount > MAX_INSTALLMENT_COUNT)
        ) {
            newErrors.installmentCount =
                `Elige entre ${MIN_INSTALLMENT_COUNT} y ${MAX_INSTALLMENT_COUNT} meses`
        }
        if (
            installmentsEnabled &&
            !isDateOnly(firstInstallmentDate)
        ) {
            newErrors.firstInstallmentDate =
                'La fecha de la primera mensualidad es requerida'
        }
        if (
            installmentsEnabled &&
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
            const saved = await createCharge(
                amountCents,
                trimmedName,
                categoryName,
                installmentsEnabled
                    ? {
                          count: installmentCount,
                          firstInstallmentDate,
                      }
                    : undefined,
            )
            if (saved) handleOpenChange(false)
        } finally {
            setSaving(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className='max-h-[90dvh] overflow-y-auto sm:max-w-sm'>
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
                                maxLength={500}
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
                        <Field>
                            <Label htmlFor='category-1'>Category</Label>
                            <Input
                                id='category-1'
                                name='category'
                                list='charge-categories'
                                maxLength={60}
                                value={categoryName}
                                onChange={(event) =>
                                    setCategoryName(event.target.value)
                                }
                                placeholder='Breakfast, services, supplies...'
                            />
                            <datalist id='charge-categories'>
                                {categories.map((category) => (
                                    <option
                                        key={category.id}
                                        value={category.name}
                                    />
                                ))}
                            </datalist>
                        </Field>
                        <Field>
                            <div className='flex items-center gap-2'>
                                <Checkbox
                                    id='installments-1'
                                    checked={installmentsEnabled}
                                    onCheckedChange={(checked) =>
                                        setInstallmentsEnabled(checked === true)
                                    }
                                />
                                <Label htmlFor='installments-1'>A meses</Label>
                            </div>
                        </Field>
                        {installmentsEnabled ? (
                            <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
                                <Field>
                                    <Label htmlFor='installment-count-1'>
                                        Meses
                                    </Label>
                                    <Input
                                        id='installment-count-1'
                                        name='installment-count'
                                        type='number'
                                        min={MIN_INSTALLMENT_COUNT}
                                        max={MAX_INSTALLMENT_COUNT}
                                        step={1}
                                        value={installmentCount}
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
                                    <Label htmlFor='first-installment-date-1'>
                                        Primera mensualidad
                                    </Label>
                                    <Input
                                        id='first-installment-date-1'
                                        name='first-installment-date'
                                        type='date'
                                        value={firstInstallmentDate}
                                        onChange={(event) =>
                                            setFirstInstallmentDate(
                                                event.target.value,
                                            )
                                        }
                                    />
                                    {errors.firstInstallmentDate && (
                                        <FieldError>
                                            {errors.firstInstallmentDate}
                                        </FieldError>
                                    )}
                                </Field>
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
            </DialogContent>
        </Dialog>
    )
}
