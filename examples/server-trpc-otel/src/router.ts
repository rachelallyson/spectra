import { initTRPC } from '@trpc/server'
import { z } from 'zod'
import { catalog, withProcedureEvents } from './observability.js'

const t = initTRPC.context<{ requestId: string }>().create()

export const appRouter = t.router({
  /** Wrap every procedure with started/succeeded/failed. */
  createOrder: t.procedure
    .input(z.object({ amount: z.number(), userId: z.string() }))
    .mutation(
      withProcedureEvents('createOrder', async ({ ctx, input }) => {
        const orderId = `o_${Math.random().toString(36).slice(2, 8)}`
        catalog.emit('order.created', {
          amount: input.amount,
          orderId,
          requestId: ctx.requestId,
        })
        return { orderId }
      }),
    ),

  health: t.procedure.query(() => ({ ok: true })),
})

export type AppRouter = typeof appRouter
