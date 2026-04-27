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

export function setErrorSink(sink: ErrorSink): void {
  activeSink = sink
}

export function captureError(err: unknown, context: ErrorContext = {}): void {
  activeSink(err, context)
}
