# AGENTS.md — dsh-persona-presets

从 dsh-agentic-pet 抽出的通用「预设 + 设置页人设」插件：三个自定义 agent 预设（persona-custom-1/2/3），每个预设一张可编辑角色卡。与宠物无关——桌宠挂这些预设会失去 pet_* 工具。

## 命令

```cmd
npm install
npm run build       # tsdown → lib/index.js + lib/persona.js（自包含，不依赖 monorepo）
npm test            # vitest run
npm run typecheck   # tsc --noEmit
```

无 lint 配置；风格以 dsh-agentic-pet 为准（英文注释讲 Why 不讲 What；导出符号必带 doc 注释）。

## 架构一览

- `src/index.ts` — 束行（cordis.patch.yml 插入），inject ['webServer']，只装设置路由。
- `src/persona.ts` — 人设行（presets 以 `dsh-persona-presets/persona` 挂载）：占据 `deployment:persona-prefix` 段、替换官方 `@deepseek-ai/dsh-persona`，text 是每次组装实时读文件的函数（改动下回合生效，无缓存）。
- `src/merge.ts` — 白名单合并 + 文件装载（纯函数，vitest 直测）。
- `src/settings-page.ts` — 宿主半路由 `/api/persona-settings/read|update`，同源回环围栏（403/405/422/500 语义与 dsh-agentic-pet 对齐）。
- `client/persona-settings.js` — client 半：设置页「人设」区块，手写 `__ModuleLoader__` bundle，无构建步骤。
- `presets/persona-custom.patch.yml` — 三预设声明（克隆 dsh standard 工具行）。
- 存储：`~/.dsh/persona-presets/persona-settings.json`，字段 `personas.<presetId>`（`DSH_HOME` 可改根）。

## 铁律

1. **patch yml 单根**：一个 patch 文件只能有一个顶层 `- insert:`——第二段顶层条目会被 patch applier **静默丢弃**（dsh-agentic-pet 实测教训）。多预设 = 同一个 `- insert:` 下多条。
2. **interpolate: false 不可移除**：用户自由文本进严格 `{{}}` 插值会让整次 prompt 组装抛异常。
3. **白名单合并语义**：只有 `PERSONA_PRESET_IDS` 内的键可写；空串=删除槽位=回落默认卡；非字符串忽略；先 trim 后截 8000（`MAX_PERSONA_CHARS`，读侧同口径，手编文件绕不过）。
4. **standard 克隆纪律**：工具行深拷贝自 dsh 的 `presets/standard.patch.yml`；上游演进时 tests/presets.spec.ts 的深比对会红，按 red 重拷（dsh-agentic-pet presets/ 同款纪律）。
5. **双 face 模式**：宿主服务（systemPrompt/webServer）未发布 npm，用 interface face + `as unknown` 双投访问，禁止本地 `declare module` 重声明（TS2717 合并冲突）。
6. **client 无构建步骤**：ES5 风格手写 bundle；apply 逐 section 降级（safe 包裹），客户端启动审计对 throw 是致命的。
7. **locale 锚点**：`exports "./locale/*.json"` 与 `docs/DETAIL.zh.md` 必须保留——插件市场详情页读 `locale/<lang>.json` 的 meta.detail。
8. **npm 源坑**：本机默认源是 npmmirror（只读镜像）——装包可以，发布必须显式 `--registry https://registry.npmjs.org`；js-yaml 停在 ^4.3.2（5.5.0 在镜像是假包）。
