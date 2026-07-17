import { importPKCS8, importSPKI } from 'jose'

let privateKeyPromise: ReturnType<typeof importPKCS8> | null = null
let publicKeyPromise: ReturnType<typeof importSPKI> | null = null

export async function getPrivateKey() {
    privateKeyPromise ??= importPrivateKey()
    return privateKeyPromise
}

export async function getPublicKey() {
    publicKeyPromise ??= importPublicKey()
    return publicKeyPromise
}

async function importPrivateKey() {
    try {
        return await importPKCS8(process.env.PRIVATE_KEY!, 'RS256')
    } catch (e) {
        console.error(e)
        throw new Error(
            'No se pudo cargar la clave privada para JWT. Puede generar una clave RSA con el comando `openssl genrsa -out private.pem 2048`.',
        )
    }
}

async function importPublicKey() {
    try {
        return await importSPKI(process.env.PUBLIC_KEY!, 'RS256')
    } catch (e) {
        console.error(e)
        throw new Error(
            'No se pudo cargar la clave publica para JWT. Puede generar una clave RSA con el comando `openssl genrsa -out private.pem 2048`.',
        )
    }
}

export const {
    DISCORD_APLICATION_ID = '',
    DISCORD_CLIENT_SECRET = '',
    ENCRYPTION_KEY = '',
    NODE_ENV = 'development',
    APP_URL = '',
} = process.env
