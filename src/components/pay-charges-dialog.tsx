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

    async function handleSubmit(e: FormEvent<HTMLFormElement>) {
        e.preventDefault()
        const form = new FormData(e.currentTarget)
        const rawAmount = form.get('amount') as string
        const parsed = parseFloat(rawAmount)

        if (isNaN(parsed) || parsed <= 0) {
            setError('Invalid amount')
            return
        }

        const amount = Math.round(parsed * 100)
        await batchPayCharges(amount)
        formRef.current?.reset()
        setError('')
        onOpenChange(false)
    }

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className='sm:max-w-sm'>
                <form ref={formRef} onSubmit={handleSubmit}>
                    <DialogHeader>
                        <DialogTitle>Pay Charges</DialogTitle>
                        <DialogDescription>
                            Pay the oldest unpaid charges with the given amount.
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
                                min={0}
                            />
                            {error && <FieldError>{error}</FieldError>}
                        </Field>
                    </FieldGroup>
                    <DialogFooter>
                        <DialogClose
                            render={<Button variant='outline'>Cancel</Button>}
                        />
                        <Button type='submit'>Pay</Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}
