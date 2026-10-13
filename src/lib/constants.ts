import { app } from './routes'
import { APP_URL } from './envs'

export const COOKIES = {
    SESSION: 'session',
    REFRESH: 'refresh',
} as const

export const REDIRECT_PATH = app.api.auth.login()

export const DISCORD_URL_REDIRECT = `${APP_URL}${REDIRECT_PATH}`
