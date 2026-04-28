import type { z } from 'zod'
import type { Catalog, SchemaMap } from './catalog.js'
import { captureError } from './errors.js'

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

type ExtractPayload<TMap extends SchemaMap, N extends keyof TMap> = z.infer<TMap[N]>

export interface WrapperFactoryConfig<TMap extends SchemaMap> {
  catalog: Catalog<TMap>
  procedure: RequiredProcedureEvents<TMap>
  job: RequiredProcedureEvents<TMap>
  externalCall?: RequiredProcedureEvents<TMap>
}

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
          errorKind: err instanceof Error ? err.constructor.name : 'unknown',
          errorMessage: err instanceof Error ? err.message : String(err),
          procedure: procedureName,
          ...failurePayload,
        } as ExtractPayload<TMap, typeof config.procedure.failed>)
        captureError(err, { procedure: procedureName })
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
        captureError(err, { job: jobName })
        throw err
      }
    }
  }

  return { withJobEvents, withProcedureEvents }
}
