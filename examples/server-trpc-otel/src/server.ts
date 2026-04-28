import { createHTTPServer } from '@trpc/server/adapters/standalone'
import { catalog, withJobEvents } from './observability.js'
import { appRouter } from './router.js'
import './tracing.js' // initialize OTel SDK before anything else

catalog.emit('app.boot', { env: process.env.NODE_ENV ?? 'development', requestId: 'boot' })

// An Inngest-style background job, wrapped so it emits started/succeeded/failed.
const sendWelcomeEmail = withJobEvents('send-welcome-email', async (to: string) => {
  catalog.emit('email.queued', { template: 'welcome', to, requestId: 'job:welcome' })
})

void sendWelcomeEmail('alice@example.com')

const server = createHTTPServer({
  createContext: () => ({ requestId: crypto.randomUUID() }),
  router: appRouter,
})

server.listen(3000)
console.log('tRPC server listening on http://localhost:3000')
