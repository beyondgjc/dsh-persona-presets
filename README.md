# dsh-persona-presets

三个自定义 agent 预设，每个预设一张可编辑的角色卡——把「预设 + 设置页人设」从 dsh-agentic-pet 抽出来的通用插件，与宠物无关，任何 DSH 用户可装。

- **预设**：人设-自定义1/2/3（persona-598-custom-1/2/3），工具目录 = 标准模式克隆，人设行替换官方 `@deepseek-ai/dsh-persona`。
- **设置页**：「人设」区块，每槽一张卡（可取名），保存后下一回合生效（prompt 段每次组装实时读文件，无缓存无重启）。
- **存储**：`~/.dsh/persona-presets-598/persona-settings.json`，字段 `personas.<presetId>`，上限 8000 字/卡。
- **通用性**：桌宠挂这些预设会失去 pet_* 工具；宠物专属预设由 dsh-agentic-pet 自带，两套并存。

用户指南见 [docs/DETAIL.zh.md](docs/DETAIL.zh.md)。

## 开发

```cmd
npm install
npm run build      # tsdown → lib/index.js + lib/persona.js
npm test           # vitest
npm run typecheck  # tsc --noEmit
```

本包自包含：唯一运行时依赖是宿主提供的 `@deepseek-ai/cordis`（peer），无私有 @deepseek-ai 包，构建不依赖 dsh monorepo——与 dsh-agentic-pet 的 monorepo 构建链不同。

## 结构

```
src/index.ts           束行：注册设置路由（inject webServer）
src/persona.ts         人设行：deployment:persona-prefix 段，实时读卡
src/merge.ts           白名单合并（空串=删槽=回落默认卡）+ 文件装载
src/settings-page.ts   宿主半：/api/persona-settings/read|update，同源围栏
client/persona-settings.js  client 半：设置页「人设」区块（手写 bundle，无构建）
presets/persona-custom.patch.yml  三预设（单根 - insert，克隆 standard 工具行）
```

## 铁律（改动前必读）

1. **patch yml 单根**：一个 patch 文件只能有一个顶层 `- insert:`，第二段顶层条目会被静默丢弃。
2. **standard 克隆纪律**：工具行复制自 dsh `presets/standard.patch.yml`，上游演进需 re-diff（对照 dsh-agentic-pet presets/ 的同款注释）。
3. **interpolate: false 不可移除**：用户自由文本进严格 `{{}}` 插值会让整次组装抛异常。
4. **白名单合并**：只有 `PERSONA_PRESET_IDS` 内的键可写；空串删除槽位；非字符串忽略；先 trim 后截断 8000。
5. **client 无构建步骤**：手写 ES5 风格 bundle，逐 section 降级（抛错只禁用该 section，不炸页面）。
6. **locale 锚点**：`exports "./locale/*.json"` 必须保留——插件市场详情页读 `locale/<lang>.json` meta.detail。
