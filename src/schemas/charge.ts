import { z } from 'zod'

export const CreateChargeSchema = z.object({
    amount: z.coerce
        .number()
        .refine((num) => Number.isInteger(Number(num.toFixed(2)) * 100), {
            error: 'Only up to 2 decimal places are allowed',
        })
        .transform((num) => Math.round(num * 100)),
    name: z.string().trim().min(1),
    card_id: z.string(),
})

export type CreateCharge = z.infer<typeof CreateChargeSchema>

export const DEFAULT_CREATE_CHARGE_VALUE: CreateCharge = {
    amount: 50,
    name: 'Cafeteria',
    card_id: '',
}

export const FormChargeSchema = CreateChargeSchema.extend({
    amount: z.number().transform((num) => Number(num.toFixed(2))),
})
