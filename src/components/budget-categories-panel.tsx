'use client'

import { FormEvent, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldGroup } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CurrencyInput } from './currency-input'
import { useInfo } from '@/stores/info.store'
import { Trash2Icon } from 'lucide-react'

function money(cents: number) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
    }).format(cents / 100)
}

function startOfMonth() {
    const date = new Date()
    date.setDate(1)
    date.setHours(0, 0, 0, 0)
    return date
}

export function BudgetCategoriesPanel() {
    const categories = useInfo((s) => s.categories)
    const charges = useInfo((s) => s.charges)
    const createCategory = useInfo((s) => s.createCategory)
    const updateCategory = useInfo((s) => s.updateCategory)
    const deleteCategory = useInfo((s) => s.deleteCategory)
    const cardAccess = useInfo((s) => s.cardAccess)
    const canWrite = cardAccess === 'owner' || cardAccess === 'write'
    const [name, setName] = useState('')
    const [budgetCents, setBudgetCents] = useState(0)

    const spentByCategory = useMemo(() => {
        const monthStart = startOfMonth()
        const map = new Map<string, number>()
        for (const charge of charges) {
            if (!charge.category_id || charge.created_at < monthStart) continue
            map.set(
                charge.category_id,
                (map.get(charge.category_id) ?? 0) + charge.amount,
            )
        }
        return map
    }, [charges])

    async function handleSubmit(event: FormEvent<HTMLFormElement>) {
        event.preventDefault()
        const trimmedName = name.trim()
        if (!trimmedName || budgetCents < 0) return
        await createCategory(trimmedName, budgetCents)
        setName('')
        setBudgetCents(0)
    }

    return (
        <div className='flex flex-col gap-4'>
            <form
                onSubmit={handleSubmit}
                className='grid gap-3 rounded-lg border p-4 md:grid-cols-[1fr_220px_auto] md:items-end'
            >
                <FieldGroup className='contents'>
                    <Field>
                        <Label htmlFor='budget-name'>Category</Label>
                        <Input
                            id='budget-name'
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            placeholder='Breakfast, services, supplies...'
                            disabled={!canWrite}
                        />
                    </Field>
                    <Field>
                        <Label htmlFor='budget-amount'>Monthly budget</Label>
                        <CurrencyInput
                            id='budget-amount'
                            valueCents={budgetCents}
                            onValueCentsChange={setBudgetCents}
                            disabled={!canWrite}
                        />
                    </Field>
                    <Button type='submit' disabled={!canWrite}>
                        Save
                    </Button>
                </FieldGroup>
            </form>

            <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
                {categories.map((category) => {
                    const spent = spentByCategory.get(category.id) ?? 0
                    const budget = category.monthly_budget
                    const pct =
                        budget > 0 ? Math.min((spent / budget) * 100, 100) : 0
                    return (
                        <Card key={category.id}>
                            <CardHeader className='flex flex-row items-start justify-between gap-3'>
                                <CardTitle className='text-base'>
                                    {category.name}
                                </CardTitle>
                                <Button
                                    variant='ghost'
                                    size='icon'
                                    className='size-8 text-muted-foreground'
                                    onClick={() => deleteCategory(category.id)}
                                    disabled={!canWrite}
                                >
                                    <Trash2Icon />
                                    <span className='sr-only'>
                                        Delete category
                                    </span>
                                </Button>
                            </CardHeader>
                            <CardContent className='flex flex-col gap-3'>
                                <div className='text-sm text-muted-foreground'>
                                    {money(spent)} spent of{' '}
                                    {budget > 0 ? money(budget) : 'no budget'}
                                </div>
                                <div className='h-2 overflow-hidden rounded-full bg-muted'>
                                    <div
                                        className='h-full bg-primary'
                                        style={{ width: `${pct}%` }}
                                    />
                                </div>
                                <CurrencyInput
                                    valueCents={budget}
                                    onValueCentsChange={(value) =>
                                        updateCategory(
                                            category.id,
                                            category.name,
                                            value,
                                        )
                                    }
                                    disabled={!canWrite}
                                />
                            </CardContent>
                        </Card>
                    )
                })}
            </div>
        </div>
    )
}
