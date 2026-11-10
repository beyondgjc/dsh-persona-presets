/**
 * The settings page's host half: local HTTP routes backing the settings
 * sidebar's 「人设」 section (the client half lives in ./client/
 * persona-settings.js and registers through the web GUI's slot system, per
 * the dsh-qqbot precedent). Routes use the raw handler form (resource-typed
 * routes postdate rc.3) behind a same-origin loopback fence, one registration
 * per path with internal method dispatch — the webserver throws on duplicate
 * path registration.
 * @module dsh-persona-presets/settings-page
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { DEFAULT_PERSONA, MAX_PERSONA_CHARS } from './persona.ts'
import { PERSONA_PRESET_IDS, dshHome, settingsFilePath } from './paths.ts'
import { mergePersonas, readPersonaSettings } from './merge.ts'

/** Structural face of the host webserver — only the one member this module
 * needs. The authoritative declarations live in the host webserver package,
 * which is not published to npm; a double cast through `unknown` is honest in
 * both faces (the persona.ts PromptRegistryFace precedent). */
interface WebServerFace {
  /** Typed as a disposable-thunk so `ctx.effect(() => register(...))` typechecks
   * against cordis's SyncEffect overload (the persona.ts section face
   * precedent); the runtime return value is whatever the host hands back. */
  register(route: {
    kind: 'exact'
    path: string
    handler: (req: unknown, res: unknown) => void | Promise<void>
  }): () => void
}

function webServerOf(ctx: Context): WebServerFace {
  return (ctx as unknown as { webServer: WebServerFace }).webServer
}

/** Same-origin loopback fence: the desktop app talks to itself over
 * 127.0.0.1/::1; anything cross-site or foreign-origin is refused. */
function isTrusted(req: IncomingMessage): boolean {
  const host = req.headers.host
  if (typeof host !== 'string') return false
  let hostname: string
  try {
    hostname = new URL(`http://${host}`).hostname
  } catch {
    return false
  }
  if (!/^(\[::1\]|localhost|127(\.\d{1,3}){3})$/.test(hostname)) return false
  if (req.headers['sec-fetch-site'] === 'cross-site') return false
  const origin = req.headers.origin
  if (origin === undefined) return true
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}

function writeJson(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  res.end(JSON.stringify(body))
}

async function readJsonBody(req: IncomingMessage): Promise<Record<string, unknown> | undefined> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const part = typeof chunk === 'string' ? Buffer.from(chunk) : chunk as Buffer
    size += part.length
    if (size > 1_000_000) return undefined
    chunks.push(part)
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    return parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : undefined
  } catch {
    return undefined
  }
}

/** The per-slot read shape the client renders (the dsh-agentic-pet read
 * route's persona block, minus the global-card inheritance level). */
interface SlotView {
  value: string
  default: string
  maxLength: number
  /** true = the value shown is the default card, not a slot the user owns. */
  inherited: boolean
}

function slotViews(home: string): Record<string, SlotView> {
  const slots = readPersonaSettings(home).personas ?? {}
  const views: Record<string, SlotView> = {}
  for (const presetId of PERSONA_PRESET_IDS) {
    const own = typeof slots[presetId] === 'string' ? (slots[presetId] as string).trim() : ''
    views[presetId] = {
      value: own !== '' ? own : DEFAULT_PERSONA,
      default: DEFAULT_PERSONA,
      maxLength: MAX_PERSONA_CHARS,
      inherited: own === '',
    }
  }
  return views
}

type RouteHandler = (req: IncomingMessage, res: ServerResponse) => Promise<void> | void

/**
 * Install the two routes. `home` is injectable for tests; production callers
 * omit it and the dsh home is resolved at install time.
 */
export function installSettingsPage(ctx: Context, home: string = dshHome()): void {
  const routeByPath = new Map<string, Map<string, RouteHandler>>()

  /** One webserver registration per path; method dispatch happens inside so
   * re-registering never collides with the webserver's duplicate check. */
  const registerRoute = (path: string, handlers: Record<string, RouteHandler>): void => {
    const byMethod = new Map(Object.entries(handlers))
    routeByPath.set(path, byMethod)
    ctx.effect(() => webServerOf(ctx).register({
      kind: 'exact',
      path,
      handler: async (req: unknown, res: unknown) => {
        const httpReq = req as IncomingMessage
        const httpRes = res as ServerResponse
        if (!isTrusted(httpReq)) {
          writeJson(httpRes, 403, { error: 'refused: same-origin loopback only' })
          return
        }
        const registered = byMethod.get(String(httpReq.method ?? '').toUpperCase())
        if (registered === undefined) {
          writeJson(httpRes, 405, { error: 'method not allowed' })
          return
        }
        try {
          await registered(httpReq, httpRes)
        } catch (error) {
          writeJson(httpRes, 500, { error: error instanceof Error ? error.message : String(error) })
        }
      },
    }), `persona-settings: ${path}`)
  }

  // GET /api/persona-settings-598/read — the three slots as rendered views
  // plus the user-assigned display names (client falls back to the built-in
  // preset labels for absent keys). Routes carry the -598 namespace marker
  // (whale598 precedent): the webserver THROWS on duplicate path
  // registration, so a generic /api/persona-settings could take the whole
  // composition down.
  registerRoute('/api/persona-settings-598/read', {
    GET: (_req, res) => {
      writeJson(res, 200, { slots: slotViews(home), names: readPersonaSettings(home).presetNames ?? {} })
    },
  })

  // POST /api/persona-settings-598/update — whitelist merge, then persist. The
  // client posts { personas: { <presetId>: text } } and/or
  // { presetNames: { <presetId>: name } }; an empty string deletes the slot
  // (reset-to-default), a non-string is ignored.
  registerRoute('/api/persona-settings-598/update', {
    POST: async (req, res) => {
      const body = await readJsonBody(req)
      if (body === undefined) {
        writeJson(res, 422, { error: 'invalid JSON body' })
        return
      }
      const next = mergePersonas(readPersonaSettings(home), body as { personas?: unknown; presetNames?: unknown })
      mkdirSync(dirname(settingsFilePath(home)), { recursive: true })
      writeFileSync(settingsFilePath(home), `${JSON.stringify(next, null, 2)}\n`, 'utf8')
      writeJson(res, 200, { ok: true, slots: slotViews(home), names: next.presetNames ?? {} })
    },
  })
}
