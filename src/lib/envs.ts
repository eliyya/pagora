import { importPKCS8, importSPKI } from 'jose'

async function getPrivateKey() {
    try {
        return await importPKCS8(process.env.PRIVATE_KEY!, 'RS256')
    } catch (e) {
        console.log(e)
        throw new Error(
            'No se pudo cargar la clave privada para JWT. Puede generar una clave RSA con el comando `openssl genrsa -out private.pem 2048`.',
        )
    }
}

async function getPublicKey() {
    try {
        return await importSPKI(process.env.PUBLIC_KEY!, 'RS256')
    } catch (e) {
        console.log(e)
        throw new Error(
            'No se pudo cargar la clave publica para JWT. Puede generar una clave RSA con el comando `openssl genrsa -out private.pem 2048`.',
        )
        process.exit(1)
    }
}

export const PRIVATE_KEY = await getPrivateKey()
export const PUBLIC_KEY = await getPublicKey()

export const {
    DISCORD_APLICATION_ID = '',
    DISCORD_CLIENT_SECRET = '',
    ENCRYPTION_KEY = '',
    NODE_ENV = 'development',
} = process.env
