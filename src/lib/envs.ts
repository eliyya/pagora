export function getSessionKey() {
    const secret = process.env.SESSION_SECRET
    const key = new TextEncoder().encode(secret ?? '')
    if (key.byteLength < 32) {
        throw new Error('SESSION_SECRET debe contener al menos 32 bytes. Genera una clave con openssl rand -hex 32.')
    }
    return key
}

export const {
    DISCORD_APLICATION_ID = '',
    ENCRYPTION_KEY = '',
    NODE_ENV = 'development',
    APP_URL = '',
} = process.env
