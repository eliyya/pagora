'use client'

import { ComponentProps } from 'react'
import { Input } from '@/components/ui/input'

export function formatCents(cents: number) {
    return (Math.max(0, cents) / 100).toFixed(2)
}

export function CurrencyInput({
    valueCents,
    onValueCentsChange,
    ...props
}: Omit<ComponentProps<typeof Input>, 'value' | 'onChange' | 'type'> & {
    valueCents: number
    onValueCentsChange: (value: number) => void
}) {
    return (
        <Input
            {...props}
            type='text'
            inputMode='numeric'
            value={formatCents(valueCents)}
            onChange={(event) => {
                const digits = event.target.value.replace(/\D/g, '')
                onValueCentsChange(digits ? Number(digits) : 0)
            }}
        />
    )
}
