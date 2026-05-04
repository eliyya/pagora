import { APP_URL } from './envs'

export const COOKIES = {
    SESSION: 'session',
    REFRESH: 'refresh',
} as const

const REDIRECT_PATH = '/api/auth/login'

export const DISCORD_URL_REDIRECT = `${APP_URL}${REDIRECT_PATH}`
