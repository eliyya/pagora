import { z } from 'zod'

export const EditChargeSchema = z.object({
    name: z.string().trim().min(1, 'El nombre es requerido'),
    amount: z.coerce
        .number()
        .int('El monto debe guardarse en centavos')
        .positive('El monto debe ser mayor a cero'),
})

export type EditCharge = z.infer<typeof EditChargeSchema>
