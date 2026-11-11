import { c as dshHome, l as settingsFilePath, n as MAX_PERSONA_CHARS, s as PERSONA_PRESET_IDS, t as DEFAULT_PERSONA } from "./persona-CI8OGwB_.js";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
function cap(raw) {
	return raw.length > 2e4 ? raw.slice(0, MAX_PERSONA_CHARS) : raw;
}
/** Read the settings file, answering an empty object when it is missing or
* unreadable — the file is the only source of truth and a broken one must
* never take the route down. */
function readPersonaSettings(home) {
	try {
		const parsed = JSON.parse(readFileSync(settingsFilePath(home), "utf8"));
		return parsed && typeof parsed === "object" ? parsed : {};
	} catch {
		return {};
	}
}
/**
* Merge one update patch into the current settings. Returns a new object;
* neither input is mutated. When the patch touches no whitelist key the
* current settings come back unchanged (as a fresh copy).
*/
function mergePersonas(current, patch) {
	const next = { ...current };
	if (patch && typeof patch.personas === "object" && patch.personas !== null) {
		const slots = { ...current.personas ?? {} };
		const patchSlots = patch.personas;
		for (const key of PERSONA_PRESET_IDS) {
			const value = patchSlots[key];
			if (typeof value !== "string") continue;
			const trimmed = value.trim();
			if (trimmed === "") Reflect.deleteProperty(slots, key);
			else slots[key] = cap(trimmed);
		}
		next.personas = slots;
	}
	if (patch && typeof patch.presetNames === "object" && patch.presetNames !== null) {
		const names = { ...current.presetNames ?? {} };
		const patchNames = patch.presetNames;
		for (const key of PERSONA_PRESET_IDS) {
			const value = patchNames[key];
			if (typeof value !== "string") continue;
			const trimmed = value.trim();
			if (trimmed === "") Reflect.deleteProperty(names, key);
			else names[key] = trimmed.length > 60 ? trimmed.slice(0, 60) : trimmed;
		}
		next.presetNames = names;
	}
	return next;
}
// src/settings-page.ts
/**
* The settings page's host half: local HTTP routes backing the settings
* sidebar's 「角色卡」 section (the client half lives in ./client/
* persona-settings.js and registers through the web GUI's slot system, per
* the dsh-qqbot precedent). Routes use the raw handler form (resource-typed
* routes postdate rc.3) behind a same-origin loopback fence, one registration
* per path with internal method dispatch — the webserver throws on duplicate
* path registration.
* @module dsh-persona-presets/settings-page
*/
function webServerOf(ctx) {
	return ctx.webServer;
}
/** Same-origin loopback fence: the desktop app talks to itself over
* 127.0.0.1/::1; anything cross-site or foreign-origin is refused. */
function isTrusted(req) {
	const host = req.headers.host;
	if (typeof host !== "string") return false;
	let hostname;
	try {
		hostname = new URL(`http://${host}`).hostname;
	} catch {
		return false;
	}
	if (!/^(\[::1\]|localhost|127(\.\d{1,3}){3})$/.test(hostname)) return false;
	if (req.headers["sec-fetch-site"] === "cross-site") return false;
	const origin = req.headers.origin;
	if (origin === void 0) return true;
	try {
		return new URL(origin).host === host;
	} catch {
		return false;
	}
}
function writeJson(res, status, body) {
	res.writeHead(status, { "content-type": "application/json; charset=utf-8" });
	res.end(JSON.stringify(body));
}
async function readJsonBody(req) {
	const chunks = [];
	let size = 0;
	for await (const chunk of req) {
		const part = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
		size += part.length;
		if (size > 1e6) return void 0;
		chunks.push(part);
	}
	try {
		const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
		return parsed && typeof parsed === "object" ? parsed : void 0;
	} catch {
		return;
	}
}
function slotViews(home) {
	const slots = readPersonaSettings(home).personas ?? {};
	const views = {};
	for (const presetId of PERSONA_PRESET_IDS) {
		const own = typeof slots[presetId] === "string" ? slots[presetId].trim() : "";
		views[presetId] = {
			value: own !== "" ? own : DEFAULT_PERSONA,
			default: DEFAULT_PERSONA,
			maxLength: MAX_PERSONA_CHARS,
			inherited: own === ""
		};
	}
	return views;
}
/**
* Install the two routes. `home` is injectable for tests; production callers
* omit it and the dsh home is resolved at install time.
*/
function installSettingsPage(ctx, home = dshHome()) {
	const routeByPath = /* @__PURE__ */ new Map();
	/** One webserver registration per path; method dispatch happens inside so
	* re-registering never collides with the webserver's duplicate check. */
	const registerRoute = (path, handlers) => {
		const byMethod = new Map(Object.entries(handlers));
		routeByPath.set(path, byMethod);
		ctx.effect(() => webServerOf(ctx).register({
			kind: "exact",
			path,
			handler: async (req, res) => {
				const httpReq = req;
				const httpRes = res;
				if (!isTrusted(httpReq)) {
					writeJson(httpRes, 403, { error: "refused: same-origin loopback only" });
					return;
				}
				const registered = byMethod.get(String(httpReq.method ?? "").toUpperCase());
				if (registered === void 0) {
					writeJson(httpRes, 405, { error: "method not allowed" });
					return;
				}
				try {
					await registered(httpReq, httpRes);
				} catch (error) {
					writeJson(httpRes, 500, { error: error instanceof Error ? error.message : String(error) });
				}
			}
		}), `persona-settings: ${path}`);
	};
	registerRoute("/api/persona-settings-598/read", { GET: (_req, res) => {
		writeJson(res, 200, {
			slots: slotViews(home),
			names: readPersonaSettings(home).presetNames ?? {}
		});
	} });
	registerRoute("/api/persona-settings-598/update", { POST: async (req, res) => {
		const body = await readJsonBody(req);
		if (body === void 0) {
			writeJson(res, 422, { error: "invalid JSON body" });
			return;
		}
		const next = mergePersonas(readPersonaSettings(home), body);
		mkdirSync(dirname(settingsFilePath(home)), { recursive: true });
		writeFileSync(settingsFilePath(home), `${JSON.stringify(next, null, 2)}\n`, "utf8");
		writeJson(res, 200, {
			ok: true,
			slots: slotViews(home),
			names: next.presetNames ?? {}
		});
	} });
}
// src/index.ts
/** Stable Cordis plugin name. The -598 suffix is the owner's namespace
* marker (whale598 precedent) — cordis rejects duplicate plugin names, so
* this is one of the bundle's collision-proofed identities. */
const name = "persona-presets-598";
/**
* The webserver service backs the settings routes. It is a sibling row's
* service in the web composition: a command-style ctx.get from this row's
* fiber never sees it, while static inject is resolved by the Loader ACROSS
* rows and waits for that row to mount. Every profile mounting this bundle
* mounts the web-app rows too, so the dependency is always satisfiable (the
* dsh-agentic-pet index.ts precedent).
*/
const inject = ["webServer"];
/** Register the settings routes; nothing else lives in the bundle row. */
function apply(ctx) {
	installSettingsPage(ctx);
}
export { apply, inject, name };
