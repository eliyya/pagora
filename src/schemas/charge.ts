import { z } from 'zod'

export const CreateChargeSchema = z.object({
    amount: z.coerce
        .number()
        .int('Amount must be stored in cents')
        .positive('Amount must be greater than zero'),
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
    amount: z.number().int().positive(),
})
