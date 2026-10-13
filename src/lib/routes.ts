// @type-routes-hash: 8b80e3496aa86ea69072cb7b0c6eafe04fcee49582016ab3c53899887191128b
// @type-routes-input-hash: 9f488a93df1bd72a5593d54f4f28f7e21399f8c3366c4c657ac8f917ddb80d3d
interface App {
        '.well-known': {
            'oauth-protected-resource': {
                (): `/.well-known/oauth-protected-resource`
            }
        }
        api: {
            'agent-tokens': {
                $token_id: {
                    <$token_id extends string>($token_id: $token_id): `/api/agent-tokens/${$token_id}`
                }
                (): `/api/agent-tokens`
            }
            auth: {
                login: {
                    (): `/api/auth/login`
                }
                logout: {
                    (): `/api/auth/logout`
                }
            }
            cards: {
                $card_id: {
                    sync: {
                        <$card_id extends string>($card_id: $card_id): `/api/cards/${$card_id}/sync`
                    }
                }
            }
            mcp: {
                (): `/api/mcp`
                version: {
                    (): `/api/mcp/version`
                }
            }
        }
        auth: {
            login: {
                (): `/auth/login`
            }
        }
        dashboard: {
            card: {
                $card_id: {
                    <$card_id extends string>($card_id: $card_id): `/dashboard/card/${$card_id}`
                }
                (): `/dashboard/card`
            }
            (): `/dashboard`
        }
        offline: {
            (): `/offline`
        }
        (): `/`
        serwist: {
            $path: {
                <$path extends string>($path: $path): `/serwist/${$path}`
            }
        }
    }


export const app = Object.assign(
        () => `/`,
        {
        '.well-known': {
            'oauth-protected-resource': () => `/.well-known/oauth-protected-resource`
        },
        api: {
            'agent-tokens': Object.assign(
                () => `/api/agent-tokens`,
                {
                $token_id: ($token_id: string) => `/api/agent-tokens/${$token_id}`
                }
            ),
            auth: {
                login: () => `/api/auth/login`,
                logout: () => `/api/auth/logout`
            },
            cards: {
                $card_id: {
                    sync: ($card_id: string) => `/api/cards/${$card_id}/sync`
                }
            },
            mcp: Object.assign(
                () => `/api/mcp`,
                {
                version: () => `/api/mcp/version`
                }
            )
        },
        auth: {
            login: () => `/auth/login`
        },
        dashboard: Object.assign(
            () => `/dashboard`,
            {
            card: Object.assign(
                () => `/dashboard/card`,
                {
                $card_id: ($card_id: string) => `/dashboard/card/${$card_id}`
                }
            )
            }
        ),
        offline: () => `/offline`,
        serwist: {
            $path: ($path: string) => `/serwist/${$path}`
        }
        }
    ) as App
