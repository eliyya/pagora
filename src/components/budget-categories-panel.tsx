'use client'

import { FormEvent, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldGroup } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CurrencyInput } from './currency-input'
import { useInfo } from '@/stores/info.store'
import type { ChargeCategory } from '@/db/generated/prisma/browser'
import { Trash2Icon } from 'lucide-react'

function money(cents: number) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
    }).format(cents / 100)
}

function monthKey(offset = 0) {
    const date = new Date()
    date.setDate(1)
    date.setMonth(date.getMonth() + offset)
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
}

function CategoryBudgetCard({
    category,
    spent,
    canWrite,
    onSave,
    onDelete,
}: {
    category: ChargeCategory
    spent: number
    canWrite: boolean
    onSave: (id: string, name: string, budget: number) => Promise<void>
    onDelete: (id: string) => Promise<void>
}) {
    const [budgetDraft, setBudgetDraft] = useState<number | null>(null)
    const [saving, setSaving] = useState(false)
    const budget = budgetDraft ?? category.monthly_budget
    const dirty = budgetDraft !== null && budget !== category.monthly_budget
    const pct =
        category.monthly_budget > 0
            ? Math.min((spent / category.monthly_budget) * 100, 100)
            : 0

    async function saveBudget() {
        if (!canWrite || !dirty || budget < 0 || saving) return
        setSaving(true)
        try {
            await onSave(category.id, category.name, budget)
            setBudgetDraft(null)
        } finally {
            setSaving(false)
        }
    }

    return (
        <Card>
            <CardHeader className='flex flex-row items-start justify-between gap-3'>
                <CardTitle className='text-base'>{category.name}</CardTitle>
                <Button
                    variant='ghost'
                    size='icon'
                    className='size-8 text-muted-foreground'
                    onClick={() => void onDelete(category.id)}
                    disabled={!canWrite || saving}
                >
                    <Trash2Icon />
                    <span className='sr-only'>Delete category</span>
                </Button>
            </CardHeader>
            <CardContent className='flex flex-col gap-3'>
                <div className='text-sm text-muted-foreground'>
                    {money(spent)} spent of{' '}
                    {category.monthly_budget > 0
                        ? money(category.monthly_budget)
                        : 'no budget'}
                </div>
                <div className='h-2 overflow-hidden rounded-full bg-muted'>
                    <div
                        className='h-full bg-primary'
                        style={{ width: `${pct}%` }}
                    />
                </div>
                <div className='flex items-center gap-2'>
                    <CurrencyInput
                        valueCents={budget}
                        onValueCentsChange={setBudgetDraft}
                        disabled={!canWrite || saving}
                    />
                    <Button
                        variant='outline'
                        onClick={() => void saveBudget()}
                        disabled={!canWrite || !dirty || saving}
                    >
                        {saving ? 'Saving…' : 'Save'}
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}

export function BudgetCategoriesPanel() {
    const categories = useInfo((s) => s.categories)
    const charges = useInfo((s) => s.charges)
    const createCategory = useInfo((s) => s.createCategory)
    const updateCategory = useInfo((s) => s.updateCategory)
    const deleteCategory = useInfo((s) => s.deleteCategory)
    const cardAccess = useInfo((s) => s.cardAccess)
    const pendingMutationCount = useInfo((s) => s.pendingMutationCount)
    const conflictCount = useInfo((s) => s.syncConflicts.length)
    const syncStatus = useInfo((s) => s.syncStatus)
    const canWrite = cardAccess === 'owner' || cardAccess === 'write'
    const canManage =
        canWrite &&
        pendingMutationCount === 0 &&
        conflictCount === 0 &&
        syncStatus !== 'offline' &&
        syncStatus !== 'error' &&
        syncStatus !== 'unauthorized' &&
        syncStatus !== 'unavailable'
    const [name, setName] = useState('')
    const [budgetCents, setBudgetCents] = useState(0)

    const spentByCategory = useMemo(() => {
        const currentMonth = monthKey()
        const map = new Map<string, number>()
        for (const charge of charges) {
            if (
                charge.kind === 'installment_parent' ||
                !charge.category_id ||
                charge.scheduled_for.toISOString().slice(0, 7) !==
                    currentMonth
            ) {
                continue
            }
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
                            disabled={!canManage}
                        />
                    </Field>
                    <Field>
                        <Label htmlFor='budget-amount'>Monthly budget</Label>
                        <CurrencyInput
                            id='budget-amount'
                            valueCents={budgetCents}
                            onValueCentsChange={setBudgetCents}
                            disabled={!canManage}
                        />
                    </Field>
                    <Button type='submit' disabled={!canManage}>
                        Save
                    </Button>
                </FieldGroup>
            </form>

            <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
                {categories.map((category) => {
                    const spent = spentByCategory.get(category.id) ?? 0
                    return (
                        <CategoryBudgetCard
                            key={category.id}
                            category={category}
                            spent={spent}
                            canWrite={canManage}
                            onSave={updateCategory}
                            onDelete={deleteCategory}
                        />
                    )
                })}
            </div>
        </div>
    )
}
