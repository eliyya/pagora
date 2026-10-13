import { Temporal } from 'temporal-polyfill'

export const MIN_INSTALLMENT_COUNT = 2
export const MAX_INSTALLMENT_COUNT = 60

export type InstallmentPlanInput = {
    count: number
    firstInstallmentDate: string
}

export type BuildInstallmentScheduleInput = InstallmentPlanInput & {
    name: string
    amount: number
}

export type InstallmentScheduleItem = {
    name: string
    amount: number
    installmentNumber: number
    installmentCount: number
    scheduledFor: string
}

export type ChargeKindValue =
    | 'single'
    | 'installment_parent'
    | 'installment'

type ChargeRoleLike = {
    kind?: ChargeKindValue | null
}

const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

function parseDateOnly(value: string) {
    if (!DATE_ONLY_PATTERN.test(value)) return null
    try {
        const date = Temporal.PlainDate.from(value, { overflow: 'reject' })
        return date.year >= 1 && date.year <= 9999 ? { year: date.year, month: date.month, day: date.day } : null
    } catch { return null }
}

export function isDateOnly(value: unknown): value is string {
    return typeof value === 'string' && parseDateOnly(value) !== null
}

export function isValidInstallmentCount(value: unknown): value is number {
    return (
        typeof value === 'number' &&
        Number.isSafeInteger(value) &&
        value >= MIN_INSTALLMENT_COUNT &&
        value <= MAX_INSTALLMENT_COUNT
    )
}

export function isValidInstallmentPlanInput(
    value: unknown,
): value is InstallmentPlanInput {
    if (!value || typeof value !== 'object') return false

    const input = value as Partial<InstallmentPlanInput>
    return (
        isValidInstallmentCount(input.count) &&
        isDateOnly(input.firstInstallmentDate)
    )
}

export function assertValidInstallmentPlanInput(
    value: unknown,
): asserts value is InstallmentPlanInput {
    if (!isValidInstallmentPlanInput(value)) {
        throw new RangeError(
            `Installment plans require ${MIN_INSTALLMENT_COUNT}-${MAX_INSTALLMENT_COUNT} installments and a valid YYYY-MM-DD first date.`,
        )
    }
}

export function distributeInstallmentAmount(
    totalAmount: number,
    count: number,
) {
    if (!Number.isSafeInteger(totalAmount) || totalAmount <= 0) {
        throw new RangeError('The total amount must be a positive integer.')
    }
    if (!isValidInstallmentCount(count)) {
        throw new RangeError(
            `The installment count must be between ${MIN_INSTALLMENT_COUNT} and ${MAX_INSTALLMENT_COUNT}.`,
        )
    }
    if (totalAmount < count) {
        throw new RangeError(
            'The total amount must allow every installment to contain at least one cent.',
        )
    }

    const baseAmount = Math.floor(totalAmount / count)
    const remainder = totalAmount % count
    return Array.from({ length: count }, (_, index) =>
        index === count - 1 ? baseAmount + remainder : baseAmount,
    )
}

export function addMonthsPreservingDay(
    firstInstallmentDate: string,
    monthOffset: number,
) {
    const first = parseDateOnly(firstInstallmentDate)
    if (!first) {
        throw new RangeError('The installment date must use YYYY-MM-DD.')
    }
    if (!Number.isSafeInteger(monthOffset) || monthOffset < 0) {
        throw new RangeError('The month offset must be a non-negative integer.')
    }

    const date = Temporal.PlainDate.from(firstInstallmentDate).add({ months: monthOffset })
    if (date.year > 9999) throw new RangeError('The installment date exceeds year 9999.')
    return date.toString()

}

export function formatInstallmentName(
    baseName: string,
    installmentNumber: number,
    installmentCount: number,
) {
    const normalizedName = baseName.trim()
    if (!normalizedName) {
        throw new RangeError('The installment name cannot be empty.')
    }
    if (
        !isValidInstallmentCount(installmentCount) ||
        !Number.isSafeInteger(installmentNumber) ||
        installmentNumber < 1 ||
        installmentNumber > installmentCount
    ) {
        throw new RangeError('The installment position is invalid.')
    }

    return `${normalizedName} (${installmentNumber}/${installmentCount})`
}

export function buildInstallmentSchedule(
    input: BuildInstallmentScheduleInput,
): InstallmentScheduleItem[] {
    assertValidInstallmentPlanInput(input)
    const amounts = distributeInstallmentAmount(input.amount, input.count)

    return amounts.map((amount, index) => {
        const installmentNumber = index + 1
        return {
            name: formatInstallmentName(
                input.name,
                installmentNumber,
                input.count,
            ),
            amount,
            installmentNumber,
            installmentCount: input.count,
            scheduledFor: addMonthsPreservingDay(
                input.firstInstallmentDate,
                index,
            ),
        }
    })
}

export function isSingleCharge(charge: ChargeRoleLike) {
    return charge.kind === undefined || charge.kind === null || charge.kind === 'single'
}

export function isInstallmentParentCharge(charge: ChargeRoleLike) {
    return charge.kind === 'installment_parent'
}

export function isInstallmentCharge(charge: ChargeRoleLike) {
    return charge.kind === 'installment'
}

export function isAccountingCharge(charge: ChargeRoleLike) {
    return !isInstallmentParentCharge(charge)
}
