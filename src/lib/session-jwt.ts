import { jwtVerify } from 'jose'
import { APP_URL, getSessionKey } from './envs'

export async function verifySessionJWT(token: string) {
    return jwtVerify(token, getSessionKey(), {
        algorithms: ['HS256'],
        issuer: APP_URL,
        audience: 'pagora',
    })
}
