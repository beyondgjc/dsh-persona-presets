# 人设预设（dsh-persona-presets）

三个自定义 agent 预设，每个预设一张可编辑的角色卡。

## 它做什么

- 安装后新增三个 agent 预设：**人设-自定义1 / 人设-自定义2 / 人设-自定义3**（persona-598-custom-1/2/3）。工具目录与标准模式完全一致。
- 设置页新增「**人设**」区块：每个预设一张卡，展开即可编辑。保存后下一回合生效，无需重启。
- 卡是预设身份的**全部内容**——没有附加的固定规则。清空并保存即回到默认卡。

## 怎么用

1. 设置页 →「人设」→ 展开某个槽位，写下角色卡（身份、性格、说话方式、边界都写这里），保存。
2. 把会话挂到对应预设（人设-自定义1/2/3），会话就带这张卡。
3. 改卡不会清空会话记忆——已开始的会话仍带着旧设定的上下文；想彻底换人，新开会话。

## 与桌宠的关系

这些是**通用 agent 预设**，与 dsh-agentic-pet 相互独立：

- 桌宠挂到这些预设上会**失去宠物工具**（pet_say 气泡、pet_do 动作等不可用），退化成普通 agent 会话。
- 宠物的专属预设（含身体规则与 pet_* 工具）由 dsh-agentic-pet 自带，两套并存、互不干扰。

## 存储

`~/.dsh/persona-presets-598/persona-settings.json`（`DSH_HOME` 环境变量可改根）：

```json
{
  "personas": {
    "persona-598-custom-1": "你的角色卡文本……"
  }
}
```

- 手编文件与设置页等效（读取实时生效）。
- 每张卡上限 8000 字（超限会被截断）。
- 不存在/损坏的文件按"全部默认卡"处理，不会拖垮会话。

## 槽位一览

| 预设 id | 名称 | order |
| --- | --- | --- |
| persona-598-custom-1 | 人设-自定义1 | 21 |
| persona-598-custom-2 | 人设-自定义2 | 22 |
| persona-598-custom-3 | 人设-自定义3 | 23 |

## 技术说明

- 人设行（`dsh-persona-presets/persona`）占据 `deployment:persona-prefix` 段、替换官方 `@deepseek-ai/dsh-persona` 行，`interpolate: false`——用户自由文本永远不会进入严格插值。
- 预设工具行克隆自 dsh 的 `presets/standard.patch.yml`；该文件演进时需 re-diff（dsh-agentic-pet 同款纪律）。
- 设置路由走同源回环围栏（非同源/跨站请求 403）。
