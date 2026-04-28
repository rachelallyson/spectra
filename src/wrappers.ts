import type { Catalog, Output, SchemaMap } from './catalog.js'
import { captureError } from './errors.js'

/**
 * Returns `true` when the error looks like an `AbortController.abort()`
 * cancellation: a `DOMException` with name `'AbortError'`, an `Error`
 * with `name === 'AbortError'`, or anything else with that property.
 *
 * The wrappers don't manage AbortSignals themselves (flow control
 * stays the caller's job), but they expose this so the failure
 * pathway can decide whether a "failed" emit is really worth alarming
 * on or just intentional cancellation.
 */
export function isAbortError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false
  const name = (err as { name?: unknown }).name

  return name === 'AbortError'
}

/**
 * Wrapper factories built against an arbitrary catalog. The app passes its
 * catalog instance plus the names of the lifecycle events for tRPC procedures,
 * Inngest jobs, and outbound external API calls; the wrappers handle emitting
 * `started/succeeded/failed` consistently so call sites stay short.
 *
 * Lint rule (planned): every tRPC procedure must be wrapped via
 * `withProcedureEvents`, every Inngest function via `withJobEvents`. That makes
 * coverage trivially uniform — no easy way to forget the emit.
 */

type RequiredProcedureEvents<TMap extends SchemaMap> = {
  started: keyof TMap
  succeeded: keyof TMap
  failed: keyof TMap
}

type ExtractPayload<TMap extends SchemaMap, N extends keyof TMap> = Output<TMap[N]>

export interface WrapperFactoryConfig<TMap extends SchemaMap> {
  /** The catalog to emit lifecycle events against. */
  catalog: Catalog<TMap>
  /** Event names for the tRPC-procedure lifecycle. */
  procedure: RequiredProcedureEvents<TMap>
  /** Event names for the background-job lifecycle. */
  job: RequiredProcedureEvents<TMap>
  /** Optional event names for outbound HTTP / vendor calls. */
  externalCall?: RequiredProcedureEvents<TMap>
}

/**
 * Returns wrapper factories that emit `started/succeeded/failed`
 * lifecycle events around any async function. The catalog is the
 * source of truth for the event names; the wrapper computes
 * `durationMs` and unpacks errors into a structured payload.
 *
 * Caught errors are also forwarded to `captureError()` so the error
 * pathway sees them — `emit('*.failed')` describes what happened to
 * the *flow*; `captureError` describes what happened to the *error*.
 *
 * ```ts
 * const { withProcedureEvents, withJobEvents } = createWrappers({
 *   catalog,
 *   procedure: { started: 'proc.started', succeeded: 'proc.succeeded', failed: 'proc.failed' },
 *   job: { started: 'job.started', succeeded: 'job.succeeded', failed: 'job.failed' },
 * })
 *
 * const send = withProcedureEvents('email.send', async (to: string) => {
 *   await mailer.send(to)
 * })
 * ```
 */
export function createWrappers<TMap extends SchemaMap>(config: WrapperFactoryConfig<TMap>) {
  const { catalog } = config

  function withProcedureEvents<TArgs extends unknown[], TResult>(
    procedureName: string,
    fn: (...args: TArgs) => Promise<TResult>,
    payloadFor?: {
      start?: (
        ...args: TArgs
      ) => Omit<ExtractPayload<TMap, typeof config.procedure.started>, 'procedure'>
      success?: (
        result: TResult,
      ) => Omit<
        ExtractPayload<TMap, typeof config.procedure.succeeded>,
        'durationMs' | 'procedure'
      >
      failure?: (
        err: unknown,
      ) => Omit<
        ExtractPayload<TMap, typeof config.procedure.failed>,
        'durationMs' | 'errorCode' | 'errorKind' | 'errorMessage' | 'procedure'
      >
    },
  ): (...args: TArgs) => Promise<TResult> {
    return async (...args) => {
      const start = Date.now()
      const startPayload = payloadFor?.start?.(...args) ?? {}

      catalog.emit(config.procedure.started, {
        procedure: procedureName,
        ...startPayload,
      } as ExtractPayload<TMap, typeof config.procedure.started>)

      try {
        const result = await fn(...args)
        const successPayload = payloadFor?.success?.(result) ?? {}

        catalog.emit(config.procedure.succeeded, {
          durationMs: Date.now() - start,
          procedure: procedureName,
          ...successPayload,
        } as ExtractPayload<TMap, typeof config.procedure.succeeded>)

        return result
      } catch (err) {
        const failurePayload = payloadFor?.failure?.(err) ?? {}

        catalog.emit(config.procedure.failed, {
          durationMs: Date.now() - start,
          errorCode: err instanceof Error ? err.name : 'UNKNOWN',
          errorKind: isAbortError(err) ? 'aborted' : err instanceof Error ? err.constructor.name : 'unknown',
          errorMessage: err instanceof Error ? err.message : String(err),
          procedure: procedureName,
          ...failurePayload,
        } as ExtractPayload<TMap, typeof config.procedure.failed>)
        // Don't push aborts through captureError — they're not bugs.
        if (!isAbortError(err)) captureError(err, { procedure: procedureName })
        throw err
      }
    }
  }

  function withJobEvents<TArgs extends unknown[], TResult>(
    jobName: string,
    fn: (...args: TArgs) => Promise<TResult>,
  ): (...args: TArgs) => Promise<TResult> {
    return async (...args) => {
      const start = Date.now()

      catalog.emit(config.job.started, { jobName } as ExtractPayload<
        TMap,
        typeof config.job.started
      >)

      try {
        const result = await fn(...args)

        catalog.emit(config.job.succeeded, {
          durationMs: Date.now() - start,
          jobName,
        } as ExtractPayload<TMap, typeof config.job.succeeded>)

        return result
      } catch (err) {
        catalog.emit(config.job.failed, {
          durationMs: Date.now() - start,
          errorMessage: err instanceof Error ? err.message : String(err),
          jobName,
        } as ExtractPayload<TMap, typeof config.job.failed>)
        if (!isAbortError(err)) captureError(err, { job: jobName })
        throw err
      }
    }
  }

  return { withJobEvents, withProcedureEvents }
}
