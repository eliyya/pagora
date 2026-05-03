export const COOKIES = {
    SESSION: 'session',
    REFRESH: 'refresh',
} as const

const REDIRECT_PATH = '/login'
export const HOST_URL =
    process.env.NODE_ENV === 'production'
        ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
        : `http://${process.env.NEXT_PUBLIC_VERCEL_URL}`

export const DISCORD_URL_REDIRECT = `${HOST_URL}${REDIRECT_PATH}`
