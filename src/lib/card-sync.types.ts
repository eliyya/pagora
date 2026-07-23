export type DailySummary = {
    date: string
    payments: number
    charges: number
}

export type CardSyncAccess = 'read' | 'write' | 'owner'

export type SerializedChargeCategory = {
    id: string
    card_id: string
    name: string
    monthly_budget: number
    created_at: string
    updated_at: string
}

export type SerializedCharge = {
    id: string
    name: string
    card_id: string
    category_id: string | null
    amount: number
    paid: number
    revision: number
    created_at: string
    updated_at: string
    category: SerializedChargeCategory | null
}

export type CardSyncPayload = {
    mode: 'snapshot' | 'delta'
    access: CardSyncAccess
    cursor: number
    charges: SerializedCharge[]
    deletedChargeIds: string[]
    categories: SerializedChargeCategory[]
    deletedCategoryIds: string[]
    summary: DailySummary[] | null
}
