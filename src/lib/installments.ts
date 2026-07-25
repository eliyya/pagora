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

function isLeapYear(year: number) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
}

function daysInMonth(year: number, month: number) {
    if (month === 2) return isLeapYear(year) ? 29 : 28
    return [4, 6, 9, 11].includes(month) ? 30 : 31
}

function parseDateOnly(value: string) {
    const match = DATE_ONLY_PATTERN.exec(value)
    if (!match) return null

    const year = Number(match[1])
    const month = Number(match[2])
    const day = Number(match[3])
    if (
        year < 1 ||
        year > 9999 ||
        month < 1 ||
        month > 12 ||
        day < 1 ||
        day > daysInMonth(year, month)
    ) {
        return null
    }

    return { year, month, day }
}

function formatDateOnly(year: number, month: number, day: number) {
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
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

    const absoluteMonth = first.year * 12 + first.month - 1 + monthOffset
    const year = Math.floor(absoluteMonth / 12)
    const month = (absoluteMonth % 12) + 1
    if (year > 9999) {
        throw new RangeError('The installment date exceeds year 9999.')
    }

    const day = Math.min(first.day, daysInMonth(year, month))
    return formatDateOnly(year, month, day)
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
