import { z } from 'zod'

export const CreateChargeSchema = z.object({
    amount: z.coerce
        .number()
        .refine((num) => Number.isInteger(num * 100), {
            error: 'Only up to 2 decimal places are allowed',
        })
        .transform((num) => Number(num.toFixed(2)) * 100),
    name: z.string().trim().min(1),
})

export type CreateChargue = z.infer<typeof CreateChargeSchema>

export const DEFAULT_CREATE_CHARGE_VALUE: CreateChargue = {
    amount: 50,
    name: 'Cafeteria',
}

export const FormChargueSchema = CreateChargeSchema.extend({
    amount: z.number().transform((num) => Number(num.toFixed(2))),
})
