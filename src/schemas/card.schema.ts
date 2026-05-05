import { z } from 'zod'
import { CARD_BRAND } from '@/db/generated/prisma/enums'

export const CreateCardSchema = z.object({
    name: z.string().min(1),
    bank: z.string().optional(),
    brand: z.enum(CARD_BRAND),
    last4: z.string().regex(/^\d{4}$/, 'deben ser 4 numeros'),
    closing_day: z.coerce.number().int().min(1).max(31),
    due_day: z.coerce.number().int().min(1).max(31),
    credit_limit: z.coerce.number().positive(),
})

export type CreateCard = z.infer<typeof CreateCardSchema>

export const DEFAULT_CREATE_CARD_VALUE: CreateCard = {
    brand: CARD_BRAND.mastercard,
    name: '',
    closing_day: 1,
    credit_limit: 1_000,
    due_day: 1,
    last4: '6789',
    bank: '',
}
