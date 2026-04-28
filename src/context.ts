import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Request-scoped context propagated via Node's AsyncLocalStorage. Set once at
 * the request edge and read from anywhere on the same async chain — tRPC
 * procedures, Inngest steps, db query tags, emit() payloads.
 *
 * Generic shape lets each app extend the base fields. The core only requires
 * `requestId`; apps add `churchId`, `tenantId`, `userId`, etc.
 */
/** Required minimum for any request context. Apps extend this. */
export interface BaseRequestContext {
  requestId: string
}

/**
 * Create a typed `AsyncLocalStorage`-backed store. Set the context
 * once at the request boundary; read it from anywhere downstream on
 * the same async chain (tRPC handlers, Inngest steps, db query tags).
 *
 * Node-only: imports `node:async_hooks`. Import from
 * `@rachelallyson/spectra/context`.
 *
 * ```ts
 * const ctx = createContext<{ requestId: string; tenantId: string }>()
 *
 * await ctx.with({ requestId: '...', tenantId: 't1' }, async () => {
 *   // anywhere in here, any depth of async:
 *   const { tenantId } = ctx.current()!
 * })
 * ```
 */
export function createContext<T extends BaseRequestContext>() {
  const storage = new AsyncLocalStorage<T>()

  return {
    current: () => storage.getStore(),
    currentRequestId: () => storage.getStore()?.requestId,
    /** Mutate the in-place context — useful for late-bound fields like userId after auth resolves. */
    update: (patch: Partial<T>) => {
      const ctx = storage.getStore()

      if (ctx) Object.assign(ctx, patch)
    },
    with: <R>(ctx: T, fn: () => R) => storage.run(ctx, fn),
  }
}

export type RequestContextStore<T extends BaseRequestContext> = ReturnType<typeof createContext<T>>
