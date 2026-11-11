/**
 * Route smoke tests for the settings host half: a fake cordis ctx collects
 * the webserver registrations, and the raw handlers are driven directly with
 * fake req/res — no server. Covers the trust fence, method dispatch, the
 * 422 path, and the persist-then-reread flow end to end.
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import type { Context } from '@deepseek-ai/cordis'
import { installSettingsPage } from '../src/settings-page.ts'
import { settingsFilePath } from '../src/paths.ts'
import { DEFAULT_PERSONA } from '../src/persona.ts'

const homes: string[] = []
afterAll(() => {
  for (const home of homes) rmSync(home, { recursive: true, force: true })
})

interface RegisteredRoute {
  path: string
  handler: (req: unknown, res: unknown) => Promise<void> | void
}

/** Minimal cordis face: effect(fn, label) runs nothing, just records — the
 * route registrations are collected by calling fn(). */
function makeCtx(): { ctx: Context; routes: RegisteredRoute[] } {
  const routes: RegisteredRoute[] = []
  const ctx = {
    effect(fn: () => unknown, label: string) {
      void label
      fn()
      return { unsubscribe() { /* noop */ } }
    },
    webServer: {
      register(route: { kind: string; path: string; handler: RegisteredRoute['handler'] }) {
        routes.push({ path: route.path, handler: route.handler })
        return () => undefined
      },
    },
  } as unknown as Context
  return { ctx, routes }
}

function makeReq(method: string, body?: unknown): unknown {
  const chunks = body === undefined ? [] : [Buffer.from(JSON.stringify(body), 'utf8')]
  const req = {
    method,
    headers: {
      host: '127.0.0.1:51982',
      origin: 'http://127.0.0.1:51982',
      'sec-fetch-site': 'same-origin',
    },
    async *[Symbol.asyncIterator]() {
      for (const chunk of chunks) yield chunk
    },
  }
  return req
}

function crossSiteReq(method: string, body?: unknown): unknown {
  const req = makeReq(method, body) as { headers: Record<string, string> }
  req.headers['sec-fetch-site'] = 'cross-site'
  return req
}

interface CapturedResponse {
  status: number
  body: string
}

async function drive(route: RegisteredRoute, req: unknown): Promise<CapturedResponse> {
  const captured: CapturedResponse = { status: 0, body: '' }
  const res = {
    writeHead(status: number) {
      captured.status = status
    },
    end(data: string) {
      captured.body = data
    },
  }
  await route.handler(req, res)
  return captured
}

function jsonOf(captured: CapturedResponse): Record<string, unknown> {
  return JSON.parse(captured.body) as Record<string, unknown>
}

let home: string
let routes: RegisteredRoute[]
beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'persona-routes-'))
  homes.push(home)
  const made = makeCtx()
  routes = made.routes
  installSettingsPage(made.ctx, home)
})

describe('persona settings routes', () => {
  it('registers exactly the two paths', () => {
    expect(routes.map(route => route.path).sort()).toEqual([
      '/api/persona-settings-598/read',
      '/api/persona-settings-598/update',
    ])
  })

  it('GET read on a fresh home answers the three default slots', async () => {
    const read = routes.find(route => route.path === '/api/persona-settings-598/read')!
    const captured = await drive(read, makeReq('GET'))
    expect(captured.status).toBe(200)
    const slots = jsonOf(captured).slots as Record<string, { value: string; inherited: boolean }>
    expect(Object.keys(slots).sort()).toEqual(['persona-598-custom-1', 'persona-598-custom-2', 'persona-598-custom-3'])
    for (const slot of Object.values(slots)) {
      expect(slot.value).toBe(DEFAULT_PERSONA)
      expect(slot.inherited).toBe(true)
    }
  })

  it('POST update persists the whitelist merge and rereads it', async () => {
    const update = routes.find(route => route.path === '/api/persona-settings-598/update')!
    const captured = await drive(update, makeReq('POST', {
      personas: { 'persona-598-custom-1': '  一号卡 ', unknown: 'dropped' },
    }))
    expect(captured.status).toBe(200)
    expect(jsonOf(captured).ok).toBe(true)
    const written = JSON.parse(readFileSync(settingsFilePath(home), 'utf8')) as { personas: Record<string, string> }
    expect(written.personas).toEqual({ 'persona-598-custom-1': '一号卡' })
    // The response slots reflect the write: slot 1 owned, the rest inherited.
    const slots = jsonOf(captured).slots as Record<string, { value: string; inherited: boolean }>
    expect(slots['persona-598-custom-1']).toEqual({ value: '一号卡', default: DEFAULT_PERSONA, maxLength: 20000, inherited: false })
    expect(slots['persona-598-custom-2'].inherited).toBe(true)
  })

  it('POST update with an empty string resets the slot to the default', async () => {
    const update = routes.find(route => route.path === '/api/persona-settings-598/update')!
    await drive(update, makeReq('POST', { personas: { 'persona-598-custom-1': '一号卡' } }))
    const captured = await drive(update, makeReq('POST', { personas: { 'persona-598-custom-1': '' } }))
    expect(captured.status).toBe(200)
    const slots = jsonOf(captured).slots as Record<string, { inherited: boolean }>
    expect(slots['persona-598-custom-1'].inherited).toBe(true)
    expect(existsSync(settingsFilePath(home))).toBe(true)
  })

  it('POST update answers 422 on an invalid JSON body', async () => {
    const update = routes.find(route => route.path === '/api/persona-settings-598/update')!
    const captured = await drive(update, makeReq('POST', 'not-json-object'))
    expect(captured.status).toBe(422)
    expect(jsonOf(captured).error).toBe('invalid JSON body')
  })

  it('answers 405 for an unmatched method', async () => {
    const read = routes.find(route => route.path === '/api/persona-settings-598/read')!
    const captured = await drive(read, makeReq('DELETE'))
    expect(captured.status).toBe(405)
  })

  it('answers 403 for a cross-site request', async () => {
    const read = routes.find(route => route.path === '/api/persona-settings-598/read')!
    const captured = await drive(read, crossSiteReq('GET'))
    expect(captured.status).toBe(403)
  })
})
