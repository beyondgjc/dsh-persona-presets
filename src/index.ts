/**
 * The dsh-persona-presets bundle: three custom agent presets with an editable
 * character card each, plus the settings routes that edit those cards. The
 * agent presets themselves register from presets/persona-custom.patch.yml
 * (declared by the `dsh.bundle.patch` manifest); this row only mounts the
 * local settings surface.
 * @module dsh-persona-presets
 */

import type { Context } from '@deepseek-ai/cordis'
import { installSettingsPage } from './settings-page.ts'

/** Stable Cordis plugin name. */
export const name = 'persona-presets'

/**
 * The webserver service backs the settings routes. It is a sibling row's
 * service in the web composition: a command-style ctx.get from this row's
 * fiber never sees it, while static inject is resolved by the Loader ACROSS
 * rows and waits for that row to mount. Every profile mounting this bundle
 * mounts the web-app rows too, so the dependency is always satisfiable (the
 * dsh-agentic-pet index.ts precedent).
 */
export const inject = ['webServer']

/** Register the settings routes; nothing else lives in the bundle row. */
export function apply(ctx: Context): void {
  installSettingsPage(ctx)
}
