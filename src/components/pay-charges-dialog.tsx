'use client'

import { FormEvent, useState } from 'react'
import { CircleDashedIcon, CircleDotIcon } from 'lucide-react'
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
import { CurrencyInput } from './currency-input'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { plainDate } from '@/lib/dates'
import { allocatePayment, payableCharges } from '@/lib/payment-allocation'
import { formatCents } from './currency-input'
import { useInfo } from '@/stores/info.store'

export function PayChargesDialog({
    open,
    onOpenChange,
}: {
    open: boolean
    onOpenChange: (value: boolean) => void
}) {
    const batchPayCharges = useInfo((s) => s.batchPayCharges)
    const charges = useInfo((s) => s.charges)
    const [selectedIds, setSelectedIds] = useState<string[] | null>(null)
    const [amountCents, setAmountCents] = useState(0)
    const [error, setError] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)

    const unpaidCharges = payableCharges(charges)
    const automatic = allocatePayment(unpaidCharges, amountCents)
    const selected = selectedIds ?? automatic.allocations.filter((entry) => entry.amount > 0).map((entry) => entry.charge.id)
    const preview = allocatePayment(unpaidCharges, amountCents, selected)
    const validAmount = Number.isSafeInteger(amountCents) && amountCents > 0 && amountCents <= 2_147_483_647
    const covered = validAmount && preview.remaining === 0
    const progress = validAmount ? Math.min(100, Math.floor(preview.appliedAmount / amountCents * 100)) : 0
    const money = (cents: number) => `$${formatCents(cents)}`

    async function handleSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault()
        if (isSubmitting || !covered) return
        const amount = amountCents
        if (!Number.isSafeInteger(amount) || amount <= 0) {
            setError('Invalid amount')
            return
        }

        setError('')
        setIsSubmitting(true)
        try {
            const outcome = await batchPayCharges(amount, selected)
            if (!outcome) {
                setError('No se pudo aplicar el pago. Revisa los saldos y tu conexión.')
                return
            }
            if (outcome.unappliedAmount > 0) {
                const money = new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: 'USD',
                })
                setError(
                    `${money.format(outcome.appliedAmount / 100)} se aplicaron. ${money.format(outcome.unappliedAmount / 100)} no se aplicaron porque los saldos pendientes ya no alcanzan.`,
                )
                if (outcome.appliedAmount > 0) setAmountCents(0)
                return
            }

            setAmountCents(0)
            setSelectedIds(null)
            setError('')
            onOpenChange(false)
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <Dialog
            open={open}
            onOpenChange={(value) => {
                if (isSubmitting) return
                if (!value) {
                    setAmountCents(0)
                    setSelectedIds(null)
                    setError('')
                }
                onOpenChange(value)
            }}
        >
            <DialogContent className='max-h-[90dvh] overflow-y-auto sm:max-w-lg'>
                <form onSubmit={handleSubmit} className='space-y-6'>
                    <DialogHeader>
                        <DialogTitle>Aplicar pago</DialogTitle>
                        <DialogDescription>
                            Selecciona cualquier cargo pendiente, sin importar su fecha. El pago se reparte del más antiguo al más nuevo.
                        </DialogDescription>
                    </DialogHeader>
                    <FieldGroup>
                        <Field>
                            <Label htmlFor='pay-amount'>Monto del pago</Label>
                            <CurrencyInput
                                id='pay-amount'
                                name='amount'
                                valueCents={amountCents}
                                onValueCentsChange={(value) => {
                                    setAmountCents(value)
                                    setError('')
                                }}
                                required
                                disabled={isSubmitting}
                            />
                            {error && <FieldError>{error}</FieldError>}
                        </Field>
                    </FieldGroup>
                    {amountCents > 0 && (
                        <section className='space-y-4' aria-label='Distribución del pago'>
                            <div className='space-y-2 rounded-lg bg-muted/50 p-4' aria-live='polite'>
                                <div className='flex justify-between gap-3 text-sm font-medium'>
                                    <span>{money(preview.appliedAmount)} de {money(amountCents)}</span>
                                    <span>{progress}%</span>
                                </div>
                                <div role='progressbar' aria-label='Monto cubierto por los cargos seleccionados' aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} className='h-2 overflow-hidden rounded-full bg-muted'>
                                    <div className='h-full rounded-full bg-primary transition-all' style={{ width: `${progress}%` }} />
                                </div>
                                <p className='text-sm text-muted-foreground'>
                                    {covered ? 'Todo el monto está asignado. Puedes aplicar el pago.' : `Selecciona más cargos para asignar los ${money(preview.remaining)} restantes.`}
                                </p>
                            </div>
                            <div className='flex items-center justify-between gap-2'>
                                <h3 className='text-sm font-medium'>Cargos pendientes · más antiguos primero</h3>
                                <Button type='button' variant='ghost' size='sm' disabled={isSubmitting} onClick={() => setSelectedIds(null)}>Automático</Button>
                            </div>
                            {unpaidCharges.length === 0 && <p className='text-sm text-muted-foreground'>No hay cargos pendientes de pago.</p>}
                            <div className='max-h-72 space-y-2 overflow-y-auto p-1'>
                                {preview.allocations.map(({ charge, amount, remainingBalance }) => {
                                    const checked = selected.includes(charge.id)
                                    const disabled = isSubmitting || (covered && !checked)
                                    const partial = charge.paid > 0
                                    const StatusIcon = partial ? CircleDotIcon : CircleDashedIcon
                                    const status = partial ? 'En progreso' : 'Pendiente'
                                    return (
                                        <label key={charge.id} className={`flex items-start gap-3 rounded-lg border p-3 ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'} ${checked ? 'border-primary/40 bg-primary/5' : ''}`}>
                                            <Checkbox className='mt-1' checked={checked} disabled={disabled} onCheckedChange={(value) => {
                                                if (disabled) return
                                                setSelectedIds(value ? [...selected, charge.id] : selected.filter((id) => id !== charge.id))
                                                setError('')
                                            }} />
                                            <span className='min-w-0 flex-1 space-y-1 text-sm'>
                                                <span className='flex items-start justify-between gap-3'>
                                                    <span className='flex min-w-0 items-center gap-2 font-medium'>
                                                        <span className='break-words'>{charge.name}</span>
                                                        <span title={status} className={`shrink-0 ${partial ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}>
                                                            <StatusIcon className='size-4' aria-hidden='true' />
                                                            <span className='sr-only'>{status}</span>
                                                        </span>
                                                    </span>
                                                    <span className='shrink-0 text-right tabular-nums'>
                                                        <span className='block font-medium'>{money(charge.amount)}</span>
                                                        <span className='block text-xs text-muted-foreground'>Abonado {money(charge.paid)}</span>
                                                    </span>
                                                </span>
                                                <span className='block text-xs text-muted-foreground'>{plainDate(charge.scheduled_for).toLocaleString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                                {partial && <span className='block text-xs text-muted-foreground'>Saldo pendiente {money(charge.amount - charge.paid)}</span>}
                                                <span className='block text-xs text-muted-foreground'>
                                                    {amount > 0 ? `${remainingBalance === 0 ? 'Se liquida' : 'Pago parcial'} · Aplicar ${money(amount)}${remainingBalance > 0 ? ` · Restan ${money(remainingBalance)}` : ''}` : checked ? 'Sin abono: el monto se asignó a cargos anteriores.' : 'No incluido en este pago'}
                                                </span>
                                            </span>
                                        </label>
                                    )
                                })}
                            </div>
                        </section>
                    )}
                    <DialogFooter>
                        <DialogClose
                            render={
                                <Button
                                    variant='outline'
                                    disabled={isSubmitting}
                                >
                                    Cancelar
                                </Button>
                            }
                        />
                        <Button type='submit' disabled={isSubmitting || !covered}>
                            {isSubmitting ? 'Paying…' : 'Pay'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
