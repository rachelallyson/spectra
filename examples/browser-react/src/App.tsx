import { useEffect, useState } from 'react'
import { catalog } from './observability'

export default function App() {
  const [route, setRoute] = useState('/home')

  useEffect(() => {
    catalog.emit('app.boot', { env: import.meta.env.MODE })
  }, [])

  function go(to: string) {
    catalog.emit('route.changed', { from: route, to })
    setRoute(to)
  }

  function signIn() {
    catalog.emit('auth.signed_in', {
      email: 'user@example.com',
      userId: 'u_42',
    })
  }

  function buy() {
    catalog.emit('checkout.started', { items: 3 })
    setTimeout(() => {
      catalog.emit('checkout.completed', { amount: 4999, orderId: 'o_99' })
    }, 250)
  }

  return (
    <main style={{ fontFamily: 'system-ui', padding: 32 }}>
      <h1>Spectra browser example</h1>
      <p>Current route: <code>{route}</code></p>
      <p>
        Open the network tab and watch <code>/api/events</code> get POSTed in
        batches; close the tab and watch <code>/api/coverage</code> fire via{' '}
        <code>sendBeacon</code>.
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={() => go('/about')}>Go /about</button>
        <button onClick={() => go('/home')}>Go /home</button>
        <button onClick={signIn}>Sign in</button>
        <button onClick={buy}>Buy</button>
      </div>
    </main>
  )
}
