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
import { Input } from '@/components/ui/input'
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
    const [error, setError] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)

    async function handleSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault()
        if (isSubmitting) return
        const form = new FormData(e.currentTarget)
        const rawAmount = form.get('amount') as string
        const parsed = parseFloat(rawAmount)

        if (isNaN(parsed) || parsed <= 0) {
            setError('Invalid amount')
            return
        }

        const amount = Math.round(parsed * 100)
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
                if (outcome.appliedAmount > 0) formRef.current?.reset()
                return
            }

            formRef.current?.reset()
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
                    formRef.current?.reset()
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
                            <Input
                                id='pay-amount'
                                name='amount'
                                type='number'
                                step='0.01'
                                min={0.01}
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
