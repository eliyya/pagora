// @type-routes-hash: 34a52786d63051f8e942be15f7fc3ebb29bccb4e606e8d8044d9ee1d678473fa
// @type-routes-input-hash: 6bfd8f2eae44864fee7dc5bfd747f3dbb5b5eb8054607a03dfb95d58bd23879c
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
            cron: {
                subscriptions: {
                    (): `/api/cron/subscriptions`
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
            cron: {
                subscriptions: () => `/api/cron/subscriptions`
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
