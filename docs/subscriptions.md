# Suscripciones mensuales: modelo de datos

`Subscription` guarda una regla mensual por tarjeta. No representa deuda ni crea
cargos futuros. El importe está en centavos y debe ser positivo. La categoría es
opcional; los permisos se heredan de la tarjeta.

- `starts_on`: primera fecha y ancla mensual. Un inicio el 31 de enero corresponde
  al último día de febrero y al 31 de marzo. Calcular siempre desde el ancla con
  `Temporal.PlainDate`, sin encadenar fechas ajustadas de meses cortos.
- `next_due_on`: próxima ocurrencia sin procesar. Inicialmente es `starts_on`.
  Se conserva al pausar o cancelar; únicamente se procesan reglas `active`.
- `time_zone`: zona IANA explícita para determinar el día actual, inicialmente
  `America/Mexico_City`. La aplicación deberá validar que sea una zona válida.
- `status`: `active`, `paused` o `canceled`. Cancelar conserva la regla y sus cargos.
- `revision`: versión para las futuras mutaciones y sincronización, siguiendo la
  convención de las otras entidades de la tarjeta.

Cada ocurrencia se registra como un `Charge` de tipo `single`, con
`subscription_id` y `subscription_due_on`. Este último identifica la fecha
original de la recurrencia y debe permanecer intacto aunque se modifique
`scheduled_for`. El índice único sobre ambos campos evita insertar dos cargos
para la misma ocurrencia. Los cargos normales y diferidos dejan ambos en `null`.
La relación compuesta exige que el cargo y la suscripción pertenezcan a la misma
tarjeta. Los cargos conservan su propio nombre, importe y categoría como historial.

La base impide eliminar una suscripción que todavía tenga cargos asociados.
Eliminar la tarjeta elimina tanto sus cargos como sus suscripciones. Eliminar
una categoría deja su referencia en `null`, siguiendo la convención existente.

## Generación y sincronización

El generador crea cada cargo vencido, avanza `next_due_on` y registra
los cambios de sincronización dentro de una transacción con control de
concurrencia. No se deben generar ocurrencias posteriores al día actual de la
zona configurada. Los reintentos deben recuperar fechas pendientes y respetar
la identidad única de la ocurrencia.

Al reanudar una pausa, avanzar a la primera ocurrencia del ancla en o después de
la fecha de reanudación, omitiendo el intervalo pausado. Antes de editar importe,
nombre o categoría, resolver las ocurrencias ya vencidas con los valores
anteriores. Validar que la categoría pertenezca a la tarjeta, como en los cargos.
No retroceder el cursor al borrar un cargo generado: la restricción única cubre
cargos existentes, mientras que el cursor evita regenerar ocurrencias eliminadas.

`generateSubscriptionCharges` es la entrada interna para el futuro cron. Cada
lote procesa hasta 100 suscripciones y cada transacción hasta 120 mensualidades.
El resultado devuelve `nextCursor` para continuar la página, `pending` para las
suscripciones con más fechas pendientes y `errors` para reintentar las fallidas.
Tras completar las páginas, una nueva pasada desde el inicio recupera pendientes.
El endpoint `GET /api/cron/subscriptions` procesa las páginas y vuelve a recorrer
los pendientes dentro de un presupuesto de 240 segundos (función de 300 segundos).
Devuelve 503 si quedan errores o se agota el tiempo; los cargos confirmados se
conservan y otra ejecución recupera lo restante. Vercel no reintenta automáticamente
los fallos: revisar los logs y ejecutar manualmente el cron o esperar el siguiente día.

`vercel.json` programa la ejecución diaria a las 07:00 UTC (01:00 en Ciudad de
México). En Hobby puede ejecutarse dentro de esa hora. Cada suscripción usa su
propia zona horaria para determinar las fechas vencidas.

Antes de desplegar, configurar `CRON_SECRET` en el entorno Production de Vercel
con un secreto aleatorio independiente (por ejemplo, `openssl rand -hex 32`).
Vercel envía `Authorization: Bearer <CRON_SECRET>` automáticamente. Sin secreto
el endpoint devuelve 503; con autorización incorrecta, 401, sin generar cargos.
El cron se activa al desplegar a producción; no se ejecuta en preview ni local.

La creación genera inmediatamente las ocurrencias vencidas, incluida la de hoy.
Si el inicio está en el futuro no genera cargos. Reanudar también genera el cargo
del día si corresponde. El bloqueo de la tarjeta serializa las operaciones; el
índice único protege cada ocurrencia. Cargos, cursor y registro de sincronización
se guardan juntos o se revierten juntos. Los cargos quedan pendientes de pago.
