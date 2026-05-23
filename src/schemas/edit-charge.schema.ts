import { z } from 'zod'

export const EditChargeSchema = z.object({
    name: z.string().trim().min(1, 'El nombre es requerido'),
    amount: z.coerce
        .number()
        .refine((num) => Number.isInteger(Number(num.toFixed(2)) * 100), {
            error: 'Solo se permiten hasta 2 decimales',
        })
        .transform((num) => Math.round(num * 100)),
})

export type EditCharge = z.infer<typeof EditChargeSchema>
