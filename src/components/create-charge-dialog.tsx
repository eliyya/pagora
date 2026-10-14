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
import { Temporal } from 'temporal-polyfill'
import { toast } from 'sonner'
import { createSubscriptionAction } from '@/actions/subscription.action'
import { isSubscriptionTimeZone } from '@/schemas/subscription'
import { useCreateDialogState } from '@/stores/charges.store'
import { useShallow } from 'zustand/shallow'
import { useInfo } from '@/stores/info.store'
import { CurrencyInput } from './currency-input'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
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
    const [paymentType, setPaymentType] = useState('single')
    const installmentsEnabled = paymentType === 'deferred'
    const subscriptionEnabled = paymentType === 'subscription'
    const [startsOn, setStartsOn] = useState('')
    const [timeZone, setTimeZone] = useState('America/Mexico_City')
    const subscriptionId = useRef<string | null>(null)
    const [installmentCount, setInstallmentCount] = useState(2)
    const [firstInstallmentDate, setFirstInstallmentDate] = useState('')
    const [errors, setErrors] = useState<{
        name?: string
        amount?: string
        installmentCount?: string
        firstInstallmentDate?: string
        startsOn?: string
        timeZone?: string
        submit?: string
    }>({})
    const [saving, setSaving] = useState(false)

    function resetForm() {
        setName('')
        setAmountCents(0)
        setCategoryName('')
        setPaymentType('single')
        setStartsOn('')
        setTimeZone('America/Mexico_City')
        subscriptionId.current = null
        setInstallmentCount(2)
        setFirstInstallmentDate('')
        setErrors({})
    }

    function handleOpenChange(nextOpen: boolean) {
        if (saving) return
        if (!nextOpen) resetForm()
        toggle(nextOpen)
    }

    async function handleSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault()
        if (saving) return
        const trimmedName = name.trim()

        const newErrors: typeof errors = {}
        if (!trimmedName) newErrors.name = 'Name is required'
        if (!Number.isSafeInteger(amountCents) || amountCents <= 0 || amountCents > 2_147_483_647) newErrors.amount = 'Invalid amount'
        if (subscriptionEnabled && !isDateOnly(startsOn)) {
            newErrors.startsOn = 'Elige la fecha del primer cargo'
        }
        if (subscriptionEnabled && !isSubscriptionTimeZone(timeZone.trim())) {
            newErrors.timeZone = 'Escribe una zona horaria válida, por ejemplo America/Mexico_City'
        }
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
            if (subscriptionEnabled) {
                const { activeCardId, activeUserId, syncCard } = useInfo.getState()
                if (!activeCardId) {
                    setErrors({ submit: 'Selecciona una tarjeta para continuar.' })
                    return
                }
                subscriptionId.current ??= crypto.randomUUID()
                const result = await createSubscriptionAction({
                    id: subscriptionId.current,
                    cardId: activeCardId,
                    name: trimmedName,
                    amount: amountCents,
                    categoryName,
                    startsOn,
                    timeZone,
                })
                if ('error' in result) {
                    setErrors({ submit: result.error })
                    return
                }
                toast.success('Suscripción guardada')
                resetForm()
                toggle(false)
                if (activeUserId) void syncCard(activeCardId, activeUserId)
                return
            }
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
            if (saved) {
                resetForm()
                toggle(false)
            }
        } catch {
            setErrors({ submit: 'No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.' })
        } finally {
            setSaving(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className='max-h-[90dvh] overflow-y-auto sm:max-w-sm'>
                <form onSubmit={handleSubmit} className='flex flex-col gap-6'>
                    <DialogHeader>
                        <DialogTitle>{subscriptionEnabled ? 'Nueva suscripción' : 'New Charge'}</DialogTitle>
                        <DialogDescription>
                            {subscriptionEnabled ? 'Configura un cargo mensual recurrente para esta tarjeta.' : 'Create a new chargue into the credit card.'}
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
                            <Label htmlFor='username-1'>{subscriptionEnabled ? 'Importe mensual' : 'Amount'}</Label>
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
                            <Label id='payment-type-label'>Tipo de pago</Label>
                            <ToggleGroup
                                aria-labelledby='payment-type-label'
                                multiple={false}
                                spacing={1}
                                value={[paymentType]}
                                disabled={saving}
                                onValueChange={(values) => {
                                    if (!values.length) return
                                    if (values[0] === 'subscription' && !startsOn) {
                                        const zone = isSubscriptionTimeZone(timeZone.trim())
                                            ? timeZone.trim()
                                            : 'America/Mexico_City'
                                        setStartsOn(Temporal.Now.plainDateISO(zone).toString())
                                    }
                                    setPaymentType(values[0])
                                    setErrors({})
                                }}
                                className='w-full rounded-lg bg-muted p-1'
                            >
                                <ToggleGroupItem
                                    type='button'
                                    value='single'
                                    className='flex-1 rounded-md aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-sm'
                                >
                                    Único
                                </ToggleGroupItem>
                                <ToggleGroupItem
                                    type='button'
                                    value='deferred'
                                    className='flex-1 rounded-md aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-sm'
                                >
                                    Diferido
                                </ToggleGroupItem>
                                <ToggleGroupItem
                                    type='button'
                                    value='subscription'
                                    className='flex-1 rounded-md aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-sm'
                                >
                                    Suscripción
                                </ToggleGroupItem>
                            </ToggleGroup>
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
                        {subscriptionEnabled && (
                            <div className='flex flex-col gap-3'>
                                <p className='text-sm text-muted-foreground'>
                                    Frecuencia mensual, sin fecha de término. El importe corresponde a cada cargo.
                                </p>
                                <Field>
                                    <Label htmlFor='subscription-start'>Primer cargo</Label>
                                    <Input id='subscription-start' name='subscription-start' type='date'
                                        value={startsOn} disabled={saving}
                                        aria-invalid={!!errors.startsOn}
                                        onChange={(event) => setStartsOn(event.target.value)} />
                                    {errors.startsOn && <FieldError>{errors.startsOn}</FieldError>}
                                    <p className='text-xs text-muted-foreground'>
                                        Se repetirá el mismo día de cada mes. Si ese día no existe, se usará el último día del mes.
                                    </p>
                                </Field>
                                <Field>
                                    <Label htmlFor='subscription-zone'>Zona horaria</Label>
                                    <Input id='subscription-zone' name='subscription-zone'
                                        value={timeZone} maxLength={100} disabled={saving}
                                        placeholder='America/Mexico_City' aria-invalid={!!errors.timeZone}
                                        onChange={(event) => setTimeZone(event.target.value)} />
                                    {errors.timeZone && <FieldError>{errors.timeZone}</FieldError>}
                                </Field>
                            </div>
                        )}
                        {errors.submit && <FieldError role='alert'>{errors.submit}</FieldError>}
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
                            {saving ? 'Guardando…' : subscriptionEnabled ? 'Guardar suscripción' : 'Save changes'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
