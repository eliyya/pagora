'use server'

import { db } from '@/db/prisma'
import { getCurrentUserAction } from './users.action'
import { canWriteCard, getCardAccess } from '@/lib/card-access'
import { beginCardChange, recordCardChanges } from '@/lib/card-changes'
import { dateOnlyToUtc } from '@/lib/charge-creation'
import { CreateSubscriptionSchema, type CreateSubscriptionInput } from '@/schemas/subscription'
import { ManageSubscriptionSchema, type ManageSubscriptionInput } from '@/schemas/subscription'
import { canReadCard } from '@/lib/card-access'
import { Temporal } from 'temporal-polyfill'
import { resumedSubscriptionDate } from '@/lib/subscriptions'

export async function createSubscriptionAction(input: CreateSubscriptionInput) {
    const user = await getCurrentUserAction()
    if (!user) return { error: 'Inicia sesión para guardar la suscripción.' }
    const parsed = CreateSubscriptionSchema.safeParse(input)
    if (!parsed.success) return { error: 'Revisa los datos de la suscripción.' }
    const data = parsed.data

    return db.$transaction(async (tx) => {
        const access = await getCardAccess(data.cardId, user.id, tx)
        if (!access || !canWriteCard(access.access)) {
            return { error: 'No tienes permiso para agregar suscripciones a esta tarjeta.' }
        }
        const revision = await beginCardChange(data.cardId, tx)
        // A stable client ID makes retries safe after a lost response.
        const existing = await tx.subscription.findUnique({ where: { id: data.id } })
        if (existing) {
            return existing.card_id === data.cardId
                ? { data: { id: existing.id } }
                : { error: 'No se pudo guardar la suscripción.' }
        }
        const category = data.categoryName
            ? await tx.chargeCategory.upsert({
                where: { card_id_name: { card_id: data.cardId, name: data.categoryName } },
                update: {},
                create: { card_id: data.cardId, name: data.categoryName },
            })
            : null
        const subscription = await tx.subscription.create({
            data: {
                id: data.id,
                card_id: data.cardId,
                name: data.name,
                amount: data.amount,
                category_id: category?.id ?? null,
                starts_on: dateOnlyToUtc(data.startsOn),
                next_due_on: dateOnlyToUtc(data.startsOn),
                time_zone: data.timeZone,
                revision,
            },
        })
        if (category) {
            await recordCardChanges(data.cardId, revision, [{
                entity: 'category', entityId: category.id, operation: 'upsert',
            }], tx)
        }
        return { data: { id: subscription.id } }
    })
}

export async function listSubscriptionsAction(cardId: string) {
    const user = await getCurrentUserAction()
    if (!user) return { error: 'Inicia sesión para consultar las suscripciones.' }
    if (typeof cardId !== 'string' || !cardId || cardId.length > 512) return { error: 'Tarjeta inválida.' }
    const access = await getCardAccess(cardId, user.id)
    if (!access || !canReadCard(access.access)) return { error: 'No tienes acceso a esta tarjeta.' }
    const subscriptions = await db.subscription.findMany({
        where: { card_id: cardId }, include: { category: true },
        orderBy: [{ status: 'asc' }, { next_due_on: 'asc' }, { name: 'asc' }],
    })
    return { data: subscriptions.map((item) => ({
        id: item.id, name: item.name, amount: item.amount, status: item.status,
        categoryName: item.category?.name ?? '', revision: item.revision,
        startsOn: item.starts_on.toISOString().slice(0, 10),
        nextDueOn: item.next_due_on.toISOString().slice(0, 10), timeZone: item.time_zone,
    })) }
}

export async function manageSubscriptionAction(input: ManageSubscriptionInput) {
    const user = await getCurrentUserAction()
    if (!user) return { error: 'Inicia sesión para continuar.' }
    const parsed = ManageSubscriptionSchema.safeParse(input)
    if (!parsed.success) return { error: 'Revisa el nombre, importe y categoría.' }
    const data = parsed.data
    return db.$transaction(async (tx) => {
        const access = await getCardAccess(data.cardId, user.id, tx)
        if (!access || !canWriteCard(access.access)) return { error: 'No tienes permiso para modificar esta tarjeta.' }
        const revision = await beginCardChange(data.cardId, tx)
        const current = await tx.subscription.findFirst({ where: { id: data.id, card_id: data.cardId } })
        if (!current) return { error: 'La suscripción ya no existe.' }
        if (current.revision !== data.revision) return { error: 'La suscripción cambió. Actualiza la lista e inténtalo de nuevo.' }
        if (current.status === 'canceled') return { error: 'Esta suscripción está cancelada.' }
        if (data.operation === 'edit') {
            const category = data.categoryName ? await tx.chargeCategory.upsert({
                where: { card_id_name: { card_id: data.cardId, name: data.categoryName } },
                update: {}, create: { card_id: data.cardId, name: data.categoryName },
            }) : null
            await tx.subscription.update({ where: { id: current.id }, data: {
                name: data.name, amount: data.amount, category_id: category?.id ?? null, revision,
            } })
            if (category) await recordCardChanges(data.cardId, revision, [{ entity: 'category', entityId: category.id, operation: 'upsert' }], tx)
        } else {
            if (data.operation === 'pause' && current.status !== 'active') return { error: 'Solo puedes pausar una suscripción activa.' }
            if (data.operation === 'resume' && current.status !== 'paused') return { error: 'Solo puedes reanudar una suscripción pausada.' }
            await tx.subscription.update({ where: { id: current.id }, data: {
                status: data.operation === 'pause' ? 'paused' : data.operation === 'cancel' ? 'canceled' : 'active',
                revision,
                ...(data.operation === 'resume' ? { next_due_on: dateOnlyToUtc(resumedSubscriptionDate(
                    current.starts_on.toISOString().slice(0, 10),
                    current.next_due_on.toISOString().slice(0, 10),
                    Temporal.Now.plainDateISO(current.time_zone).toString(),
                )) } : {}),
            } })
        }
        return { data: { id: current.id } }
    })
}
