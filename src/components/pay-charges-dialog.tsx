'use client'

import { FormEvent, useRef, useState } from 'react'
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
import { useInfo } from '@/stores/info.store'

export function PayChargesDialog({
    open,
    onOpenChange,
}: {
    open: boolean
    onOpenChange: (value: boolean) => void
}) {
    const batchPayCharges = useInfo((s) => s.batchPayCharges)
    const formRef = useRef<HTMLFormElement>(null)
    const [amountCents, setAmountCents] = useState(0)
    const [error, setError] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)

    async function handleSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault()
        if (isSubmitting) return
        const amount = amountCents
        if (!Number.isSafeInteger(amount) || amount <= 0) {
            setError('Invalid amount')
            return
        }

        setError('')
        setIsSubmitting(true)
        try {
            const outcome = await batchPayCharges(amount)
            if (!outcome) {
                setError('The payment could not be applied.')
                return
            }
            if (outcome.unappliedAmount > 0) {
                const money = new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: 'USD',
                })
                setError(
                    `${money.format(outcome.appliedAmount / 100)} was applied. ${money.format(outcome.unappliedAmount / 100)} was not applied because there are no more due charges.`,
                )
                if (outcome.appliedAmount > 0) setAmountCents(0)
                return
            }

            setAmountCents(0)
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
                    setError('')
                }
                onOpenChange(value)
            }}
        >
            <DialogContent className='max-h-[90dvh] overflow-y-auto sm:max-w-sm'>
                <form ref={formRef} onSubmit={handleSubmit}>
                    <DialogHeader>
                        <DialogTitle>Pay Charges</DialogTitle>
                        <DialogDescription>
                            Pay due charges in scheduled-date order. Future
                            installments are not prepaid.
                        </DialogDescription>
                    </DialogHeader>
                    <FieldGroup>
                        <Field>
                            <Label htmlFor='pay-amount'>Amount</Label>
                            <CurrencyInput
                                id='pay-amount'
                                name='amount'
                                valueCents={amountCents}
                                onValueCentsChange={setAmountCents}
                                required
                                disabled={isSubmitting}
                            />
                            {error && <FieldError>{error}</FieldError>}
                        </Field>
                    </FieldGroup>
                    <DialogFooter>
                        <DialogClose
                            render={
                                <Button
                                    variant='outline'
                                    disabled={isSubmitting}
                                >
                                    Cancel
                                </Button>
                            }
                        />
                        <Button type='submit' disabled={isSubmitting}>
                            {isSubmitting ? 'Paying…' : 'Pay'}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
