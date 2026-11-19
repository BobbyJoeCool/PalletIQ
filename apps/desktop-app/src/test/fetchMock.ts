// A small fetch stub for unit tests (#238): responds per "METHOD /path" (query string
// included when the key has one), records every call, and 404s anything unrouted.
import { vi } from 'vitest'

export interface FetchCall { method: string; url: string; headers: Record<string, string>; body: unknown }
type Responder = { status?: number; body?: unknown } | ((call: FetchCall) => { status?: number; body?: unknown })

/** Installs the stub on globalThis.fetch and returns the recorded calls. */
export function mockFetch(routes: Record<string, Responder>): FetchCall[] {
  const calls: FetchCall[] = []
  vi.stubGlobal('fetch', vi.fn(async (input: string, init: RequestInit = {}) => {
    const method = (init.method ?? 'GET').toUpperCase()
    const headers = Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>))
    const call: FetchCall = { method, url: input, headers, body: init.body ? JSON.parse(String(init.body)) : undefined }
    calls.push(call)
    const path = input.split('?')[0]
    const route = routes[`${method} ${input}`] ?? routes[`${method} ${path}`]
    const res = typeof route === 'function' ? route(call) : route ?? { status: 404, body: { error: 'NOT_FOUND' } }
    const status = res.status ?? 200
    return new Response(res.body === undefined ? null : JSON.stringify(res.body), { status, headers: { 'Content-Type': 'application/json' } })
  }))
  return calls
}
