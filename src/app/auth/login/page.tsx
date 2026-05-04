import { Button } from '@/components/ui/button'
import { ArrowRight, Clock3, ShieldCheck, Sparkles } from 'lucide-react'
import Image from 'next/image'
import { SiDiscord } from 'react-icons/si'

export default function page() {
    return (
        <main className='relative min-h-screen overflow-hidden bg-linear-to-b from-background via-accent/10 to-secondary/10 px-4 py-10 md:px-8'>
            <div className='pointer-events-none absolute inset-0'>
                <div className='absolute -top-28 left-1/2 h-72 w-72 -translate-x-1/2 rounded-full bg-accent/45 blur-3xl' />
                <div className='absolute -left-24 top-1/3 h-80 w-80 rounded-full bg-secondary/55 blur-3xl' />
                <div className='absolute -right-20 bottom-0 h-96 w-96 rounded-full bg-primary/35 blur-3xl' />
            </div>

            <div className='relative mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-5xl items-center'>
                <section className='grid w-full gap-6 md:grid-cols-[1.1fr_.9fr]'>
                    <article className='hidden rounded-3xl border border-border/70 bg-card/85 p-8 shadow-xl shadow-primary/10 backdrop-blur-sm md:flex md:flex-col md:justify-between'>
                        <div className='space-y-5'>
                            <span className='inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1 text-xs font-medium text-foreground/80'>
                                <Sparkles className='size-3.5 text-accent' />
                                Plataforma de cobros
                            </span>
                            <div>
                                <h1 className='text-4xl leading-tight font-semibold tracking-tight text-foreground'>
                                    Pagora te ayuda a cobrar sin friccion.
                                </h1>
                                <p className='mt-3 max-w-md text-sm text-muted-foreground'>
                                    Gestiona cargos, revisa estados de pago y
                                    mantente organizado desde un solo lugar.
                                </p>
                            </div>
                        </div>

                        <ul className='mt-8 space-y-3 text-sm text-foreground/90'>
                            <li className='flex items-center gap-2'>
                                <ShieldCheck className='size-4 text-accent' />
                                Acceso seguro con OAuth de Discord
                            </li>
                            <li className='flex items-center gap-2'>
                                <Clock3 className='size-4 text-accent' />
                                Inicio en segundos
                            </li>
                        </ul>
                    </article>

                    <div className='rounded-[28px] bg-linear-to-br from-accent/80 via-primary/60 to-secondary/80 p-px shadow-2xl shadow-primary/20'>
                        <article className='rounded-[27px] border border-border/80 bg-card/95 p-6 backdrop-blur-md sm:p-8'>
                            <div className='mb-6 flex items-center justify-between'>
                                <div className='flex items-center gap-3'>
                                    <div className='flex size-12 items-center justify-center overflow-hidden rounded-2xl shadow-md shadow-primary/30'>
                                        <Image
                                            src='/logo.png'
                                            alt='Pagora logo'
                                            width={48}
                                            height={48}
                                            className='size-full object-cover'
                                        />
                                    </div>
                                    <div>
                                        <p className='text-lg font-semibold text-foreground'>
                                            Pagora
                                        </p>
                                        <p className='text-xs text-muted-foreground'>
                                            Bienvenido de vuelta
                                        </p>
                                    </div>
                                </div>
                                <span className='rounded-full border border-accent/40 bg-accent/15 px-2.5 py-1 text-[11px] font-medium text-foreground'>
                                    v1
                                </span>
                            </div>

                            <div className='rounded-2xl border border-border/80 bg-background/85 p-5 shadow-sm'>
                                <h2 className='text-xl font-semibold tracking-tight text-foreground'>
                                    Iniciar sesion
                                </h2>
                                <p className='mt-1 text-sm text-muted-foreground'>
                                    Usa tu cuenta de Discord para entrar a tu
                                    panel.
                                </p>

                                <a
                                    href='/api/auth/login'
                                    className='mt-5 block'
                                >
                                    <Button
                                        size='lg'
                                        className='h-12 w-full justify-between rounded-xl bg-accent px-4 text-accent-foreground shadow-md shadow-accent/40 transition-all duration-200 hover:scale-[1.01] hover:bg-accent/90 hover:shadow-lg hover:shadow-accent/45'
                                    >
                                        <span className='inline-flex items-center gap-2 text-sm font-medium'>
                                            <SiDiscord className='size-4' />
                                            Continuar con Discord
                                        </span>
                                        <ArrowRight className='size-4' />
                                    </Button>
                                </a>

                                <p className='mt-4 text-center text-xs text-muted-foreground'>
                                    Al iniciar sesion aceptas los terminos de
                                    uso del servicio.
                                </p>
                            </div>

                            <div className='mt-4 grid grid-cols-3 gap-2 text-center text-[11px] sm:text-xs'>
                                <span className='rounded-lg border border-secondary/45 bg-secondary/35 px-2 py-2 text-foreground/85'>
                                    Seguro
                                </span>
                                <span className='rounded-lg border border-secondary/45 bg-secondary/35 px-2 py-2 text-foreground/85'>
                                    Rapido
                                </span>
                                <span className='rounded-lg border border-secondary/45 bg-secondary/35 px-2 py-2 text-foreground/85'>
                                    Simple
                                </span>
                            </div>
                        </article>
                    </div>
                </section>
            </div>
        </main>
    )
}
