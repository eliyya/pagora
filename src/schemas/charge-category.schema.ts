import { z } from 'zod'

export const ChargeCategorySchema = z.object({
    card_id: z.string().min(1),
    name: z.string().trim().min(1, 'Name is required').max(60),
    monthly_budget: z.coerce
        .number()
        .int('Budget must be stored in cents')
        .min(0, 'Budget cannot be negative'),
})

export const EditChargeCategorySchema = ChargeCategorySchema.omit({
    card_id: true,
})

export type ChargeCategoryInput = z.infer<typeof ChargeCategorySchema>
