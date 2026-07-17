import {
    ArrowRight,
    CheckCircle2,
    ChevronRight,
    Clock,
    LayoutDashboard,
    ShieldCheck,
    Sparkles,
    TrendingUp,
    Zap,
} from 'lucide-react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'

export default async function Home() {
    return (
        <div className='scrollbar relative min-h-screen overflow-hidden bg-linear-to-b from-background via-accent/10 to-secondary/10'>
            {/* blobs de fondo globales */}
            <div className='pointer-events-none absolute inset-0'>
                <div className='absolute -top-40 left-1/2 h-96 w-96 -translate-x-1/2 rounded-full bg-accent/35 blur-3xl' />
                <div className='absolute -left-32 top-1/2 h-80 w-80 rounded-full bg-secondary/50 blur-3xl' />
                <div className='absolute -right-32 bottom-32 h-96 w-96 rounded-full bg-primary/25 blur-3xl' />
            </div>

            {/* ── NAVBAR ── */}
            <header className='relative z-20 mx-auto flex max-w-6xl items-center justify-between px-6 py-5'>
                <div className='flex items-center gap-2'>
                    <Image
                        src='/logo.png'
                        alt='Pagora logo'
                        width={36}
                        height={36}
                        className='rounded-xl shadow-md shadow-primary/30'
                    />
                    <span className='text-lg font-bold text-foreground tracking-tight'>
                        Pagora
                    </span>
                </div>
                <nav className='hidden items-center gap-6 text-sm text-muted-foreground md:flex'>
                    <a
                        href='#features'
                        className='transition-colors hover:text-foreground'
                    >
                        Características
                    </a>
                    <a
                        href='#how'
                        className='transition-colors hover:text-foreground'
                    >
                        Cómo funciona
                    </a>
                </nav>
                <a href='/auth/login'>
                    <Button
                        size='sm'
                        className='gap-2 rounded-xl bg-accent text-accent-foreground shadow-sm shadow-accent/40 hover:bg-accent/90'
                    >
                        Entrar
                        <ChevronRight className='size-4' />
                    </Button>
                </a>
            </header>

            {/* ── HERO ── */}
            <section className='relative z-10 mx-auto flex min-h-150 max-w-7xl items-center overflow-visible px-6 pt-20 pb-40'>
                {/* texto lado izquierdo */}
                <div className='relative z-10 flex max-w-xl flex-col items-start text-left'>
                    <span className='mb-5 inline-flex items-center gap-2 rounded-full border border-accent/40 bg-accent/15 px-4 py-1.5 text-xs font-medium text-foreground/80'>
                        <Sparkles className='size-3.5 text-accent' />
                        Control claro para tus tarjetas de crédito
                    </span>

                    <h1 className='text-5xl font-bold leading-tight tracking-tight text-foreground sm:text-6xl'>
                        Entiende exactamente{' '}
                        <span className='bg-linear-to-r from-accent to-primary bg-clip-text text-transparent'>
                            qué estás pagando.
                        </span>
                    </h1>

                    <p className='mt-6 max-w-md text-base text-muted-foreground'>
                        Pagora te ayuda a registrar cada cargo de tus tarjetas,
                        separar pagos parciales y saber qué compras siguen
                        pendientes aunque el banco solo muestre el total.
                    </p>

                    <div className='mt-8 flex flex-col gap-3 sm:flex-row'>
                        <a href='/auth/login'>
                            <Button
                                size='lg'
                                className='h-12 gap-2 rounded-xl bg-accent px-6 text-accent-foreground shadow-lg shadow-accent/40 transition-all hover:scale-[1.02] hover:bg-accent/90 hover:shadow-xl hover:shadow-accent/50'
                            >
                                Ordenar mis tarjetas
                                <ArrowRight className='size-4' />
                            </Button>
                        </a>
                        <a href='#features'>
                            <Button
                                variant='outline'
                                size='lg'
                                className='h-12 rounded-xl px-6'
                            >
                                Ver características
                            </Button>
                        </a>
                    </div>

                    {/* trust badges */}
                    <div className='mt-10 flex flex-wrap gap-4 text-xs text-muted-foreground'>
                        {[
                            { icon: ShieldCheck, label: 'OAuth seguro' },
                            { icon: Zap, label: 'Pagos parciales' },
                            { icon: Clock, label: 'Cortes sin confusión' },
                        ].map(({ icon: Icon, label }) => (
                            <span
                                key={label}
                                className='inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-card/80 px-3 py-1.5'
                            >
                                <Icon className='size-3.5 text-accent' />
                                {label}
                            </span>
                        ))}
                    </div>
                </div>

                {/* laptop – posición absoluta al lado derecho */}
                <div className='pointer-events-none absolute right-0 top-1/2 w-[58%] -translate-y-1/2 translate-x-[8%]'>
                    <Image
                        src='/laptop.png'
                        alt='Vista previa del dashboard de Pagora'
                        width={1280}
                        height={800}
                        className='w-full object-cover'
                        priority
                    />
                </div>
            </section>

            {/* ── FEATURES ── */}
            <section
                id='features'
                className='relative z-10 mx-auto max-w-6xl px-6 pb-28'
            >
                <div className='mb-12 text-center'>
                    <p className='text-sm font-medium uppercase tracking-widest text-accent'>
                        Características
                    </p>
                    <h2 className='mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl'>
                        Tu estado de cuenta, pero con contexto.
                    </h2>
                    <p className='mt-3 text-muted-foreground'>
                        Diseñado para saber qué pagaste, qué falta y qué se fue
                        al siguiente corte.
                    </p>
                </div>

                <div className='grid gap-5 sm:grid-cols-2 lg:grid-cols-3'>
                    {[
                        {
                            icon: LayoutDashboard,
                            title: 'Tarjetas centralizadas',
                            desc: 'Registra tus tarjetas, límites, días de corte y fechas de pago en un solo lugar.',
                        },
                        {
                            icon: TrendingUp,
                            title: 'Cargos con nombre real',
                            desc: 'Guarda qué compraste realmente, no solo el comercio y el monto que muestra el banco.',
                        },
                        {
                            icon: ShieldCheck,
                            title: 'Acceso seguro',
                            desc: 'Autenticación vía Discord OAuth. Sin contraseñas adicionales que gestionar.',
                        },
                        {
                            icon: Zap,
                            title: 'Pagos flexibles',
                            desc: 'Marca un cargo como pagado, abona a varios cargos o distribuye un pago automáticamente.',
                        },
                        {
                            icon: CheckCircle2,
                            title: 'Pendientes claros',
                            desc: 'Ve cuánto falta pagar de cada compra, incluso después de pagos parciales o adelantados.',
                        },
                        {
                            icon: Clock,
                            title: 'Cortes sin perderte',
                            desc: 'Distingue lo que pagaste en el momento de lo que quedó para el siguiente corte.',
                        },
                    ].map(({ icon: Icon, title, desc }) => (
                        <div
                            key={title}
                            className='group rounded-2xl border border-border/70 bg-card/85 p-6 shadow-sm transition-all duration-200 hover:border-accent/40 hover:shadow-md hover:shadow-accent/10'
                        >
                            <div className='mb-4 inline-flex size-10 items-center justify-center rounded-xl bg-accent/20 text-accent transition-colors group-hover:bg-accent/30'>
                                <Icon className='size-5' />
                            </div>
                            <h3 className='font-semibold text-foreground'>
                                {title}
                            </h3>
                            <p className='mt-1.5 text-sm text-muted-foreground'>
                                {desc}
                            </p>
                        </div>
                    ))}
                </div>
            </section>

            {/* ── HOW IT WORKS ── */}
            <section
                id='how'
                className='relative z-10 mx-auto max-w-4xl px-6 pb-28'
            >
                <div className='mb-12 text-center'>
                    <p className='text-sm font-medium uppercase tracking-widest text-accent'>
                        Cómo funciona
                    </p>
                    <h2 className='mt-2 text-3xl font-bold tracking-tight text-foreground sm:text-4xl'>
                        De cargo confuso a pago claro.
                    </h2>
                </div>

                <div className='grid gap-6 sm:grid-cols-3'>
                    {[
                        {
                            step: '01',
                            title: 'Inicia sesión con Discord',
                            desc: 'Sin registros complicados. Solo un clic y adentro.',
                        },
                        {
                            step: '02',
                            title: 'Registra tus cargos',
                            desc: 'Anota qué fue cada compra, cuánto costó y en qué tarjeta quedó.',
                        },
                        {
                            step: '03',
                            title: 'Aplica tus pagos',
                            desc: 'Paga un cargo específico, varios cargos o deja que Pagora distribuya el monto.',
                        },
                    ].map(({ step, title, desc }) => (
                        <div
                            key={step}
                            className='relative rounded-2xl border border-border/70 bg-card/85 p-6 shadow-sm'
                        >
                            <span className='absolute -top-3 left-5 rounded-full bg-accent px-2.5 py-0.5 text-xs font-bold text-accent-foreground'>
                                {step}
                            </span>
                            <h3 className='mt-2 font-semibold text-foreground'>
                                {title}
                            </h3>
                            <p className='mt-1.5 text-sm text-muted-foreground'>
                                {desc}
                            </p>
                        </div>
                    ))}
                </div>
            </section>

            {/* ── CTA FINAL ── */}
            <section className='relative z-10 mx-auto max-w-3xl px-6 pb-32 text-center'>
                <div className='rounded-3xl border border-accent/30 bg-linear-to-br from-accent/20 via-card/90 to-secondary/20 p-10 shadow-xl shadow-primary/10 backdrop-blur-sm'>
                    <h2 className='text-3xl font-bold tracking-tight text-foreground sm:text-4xl'>
                        ¿Listo para entender tus tarjetas?
                    </h2>
                    <p className='mt-4 text-muted-foreground'>
                        Entra con Discord y empieza a registrar cargos con el
                        contexto que tu estado de cuenta no guarda.
                    </p>
                    <a href='/auth/login' className='mt-8 inline-block'>
                        <Button
                            size='lg'
                            className='h-12 gap-2 rounded-xl bg-accent px-8 text-accent-foreground shadow-lg shadow-accent/40 transition-all hover:scale-[1.02] hover:bg-accent/90'
                        >
                            Entrar con Discord
                            <ArrowRight className='size-4' />
                        </Button>
                    </a>
                </div>
            </section>

            {/* ── FOOTER ── */}
            <footer className='relative z-10 border-t border-border/60 px-6 py-8'>
                <div className='mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 text-xs text-muted-foreground sm:flex-row'>
                    <div className='flex items-center gap-2'>
                        <Image
                            src='/logo.png'
                            alt='Pagora logo'
                            width={24}
                            height={24}
                            className='rounded-md'
                        />
                        <span className='font-medium text-foreground'>
                            Pagora
                        </span>
                    </div>
                    <p>© 2026 Pagora. Todos los derechos reservados.</p>
                </div>
            </footer>
        </div>
    )
}
