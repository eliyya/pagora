import { z } from 'zod'

export const EditChargeSchema = z.object({
    name: z.string().trim().min(1, 'El nombre es requerido'),
    amount: z.coerce
        .number()
        .int('El monto debe guardarse en centavos')
        .positive('El monto debe ser mayor a cero'),
    category_name: z.string().trim().max(60).optional().or(z.literal('')),
})

export type EditCharge = z.infer<typeof EditChargeSchema>
