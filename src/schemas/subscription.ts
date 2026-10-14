import { Temporal } from 'temporal-polyfill'
import { z } from 'zod'
import { isDateOnly } from '@/lib/installments'

export function isSubscriptionTimeZone(value: string) {
    if (/^[+-]/.test(value)) return false
    try {
        Temporal.Now.plainDateISO(value)
        return true
    } catch {
        return false
    }
}

export const CreateSubscriptionSchema = z.object({
    id: z.uuid(),
    cardId: z.string().min(1).max(512),
    name: z.string().trim().min(1).max(500),
    amount: z.number().int().positive().max(2_147_483_647),
    categoryName: z.string().trim().max(60),
    startsOn: z.string().refine(isDateOnly),
    timeZone: z.string().trim().max(100).refine(isSubscriptionTimeZone),
}).strict()

export type CreateSubscriptionInput = z.infer<typeof CreateSubscriptionSchema>

export const ManageSubscriptionSchema = z.discriminatedUnion('operation', [
    z.object({
        operation: z.literal('edit'),
        id: z.string().min(1).max(512),
        cardId: z.string().min(1).max(512),
        revision: z.number().int().nonnegative(),
        name: CreateSubscriptionSchema.shape.name,
        amount: CreateSubscriptionSchema.shape.amount,
        categoryName: CreateSubscriptionSchema.shape.categoryName,
    }).strict(),
    z.object({
        operation: z.enum(['pause', 'resume', 'cancel']),
        id: z.string().min(1).max(512),
        cardId: z.string().min(1).max(512),
        revision: z.number().int().nonnegative(),
    }).strict(),
])
export type ManageSubscriptionInput = z.infer<typeof ManageSubscriptionSchema>
