/**
 * Error-capture pathway. Stays separate from `emit()` — events describe things
 * that happened, errors describe things that went wrong. Sentry is the right
 * destination for the latter; the catalog is the right destination for the
 * former.
 *
 * Apps configure a sink (Sentry SDK, structured-log forwarder, etc.) once at
 * boot. Default is stderr JSON so log aggregation still picks it up before any
 * vendor SDK is wired.
 */
export interface ErrorContext {
  requestId?: string
  [key: string]: unknown
}

export type ErrorSink = (err: unknown, context: ErrorContext) => void

let activeSink: ErrorSink = (err, context) => {
  const message = err instanceof Error ? err.message : String(err)
  const stack = err instanceof Error ? err.stack : undefined

  console.error(
    JSON.stringify({
      level: 'error',
      message,
      stack,
      t: new Date().toISOString(),
      ...context,
    }),
  )
}

/**
 * Replace the active error sink. Call once at boot, typically with
 * Sentry's `captureException` or your structured-log forwarder.
 *
 * ```ts
 * import * as Sentry from '@sentry/node'
 * setErrorSink((err, ctx) => Sentry.captureException(err, { extra: ctx }))
 * ```
 */
export function setErrorSink(sink: ErrorSink): void {
  activeSink = sink
}

/**
 * Forward an error to the active sink. Use this for catches in code
 * paths where the error doesn't propagate to a request boundary that
 * already reports it.
 *
 * ```ts
 * try {
 *   await doRiskyThing()
 * } catch (err) {
 *   captureError(err, { requestId: ctx.requestId, op: 'doRiskyThing' })
 *   throw err  // or swallow, depending on your flow
 * }
 * ```
 *
 * Stays separate from `emit()` on purpose — events describe things
 * that happened; errors describe things that went wrong. Routing them
 * to the same sink conflates causes with effects.
 */
export function captureError(err: unknown, context: ErrorContext = {}): void {
  activeSink(err, context)
}
