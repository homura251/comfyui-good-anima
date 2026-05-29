---
name: danbooru-tags
description: Search and validate Anima-compatible Danbooru tags, artists, characters, series, appearance, clothing, pose, scene, lighting, and prompt anchors. Use before Anima image generation or when the user only wants tag/random artist lookup.
---

# Danbooru 标签检索

本 skill 是 `comfyui-animatool` 的检索辅助层：确认 Anima 可用的 Danbooru 锚点、画师、角色、作品和视觉要素。本 skill 不决定是否生图。

## 权威边界

- 检索数据默认只来自 Anima CSV / 本地索引；不要把外部泛画师表混入默认生图回填。
- 是否生图、如何组 prompt、如何交接执行都属于 `comfyui-animatool`；本 skill 只返回检索结果。
- 角色查询只返回角色 tag、aliases 和 count，不返回外观设定；不要把 aliases 当发色、服装或道具描述。

## 读取导航

| 需要处理的事         | 读取                            |
| -------------------- | ------------------------------- |
| 生图前批量校验锚点   | "执行入口" → "批量并发与多变体" |
| 查单个 tag/画师/角色 | "常用命令"                      |
| 随机画师/随机候选    | "随机画师规则"                  |
| 维护索引/排障        | "SQLite / Rust"                 |

## 执行入口

默认使用 Rust CLI。把当前 `danbooru-tags` skill 目录作为工作目录，然后调用 `.\bin\danbooru-tags.exe`。不要从其他 skill 目录找 `bin`，不要写死用户名、平台目录或绝对路径。

模型已读取本 `SKILL.md` 时，直接使用本文件所在目录：

```powershell
Set-Location -LiteralPath "<当前 danbooru-tags skill 目录>"
.\bin\danbooru-tags.exe --group artist --prefix "@mignon" --limit 5 --for-prompt --json --compact
```

如果无法从上下文确定本文件所在目录，停止并说明“无法确定 danbooru-tags skill 目录”；不要递归搜索全盘。

生图前多锚点检索优先用批量入口。优先用 `--batch-stdin`，避免临时文件和 PowerShell 5.x UTF-8 BOM 问题：

```powershell
@'
{
  "queries": [
    {"id": "character", "group": "character", "keyword": "kanade tachibana", "limit": 5},
    {"id": "series", "group": "series", "keyword": "angel beats", "limit": 5},
    {"id": "artist", "group": "artist", "prefix": "@mignon", "limit": 5}
  ]
}
'@ | .\bin\danbooru-tags.exe --batch-workers 8 --batch-stdin --for-prompt --json --compact
```

需要落盘复查时再用 `--batch-file`。写文件必须使用无 BOM UTF-8：

```powershell
@'
{
  "queries": [
    {"id": "character", "group": "character", "keyword": "kanade tachibana", "limit": 5},
    {"id": "series", "group": "series", "keyword": "angel beats", "limit": 5},
    {"id": "artist", "group": "artist", "prefix": "@mignon", "limit": 5}
  ]
}
'@ | ForEach-Object {
  [System.IO.File]::WriteAllText(
    (Join-Path (Get-Location) "batch_tags.json"),
    $_,
    [System.Text.UTF8Encoding]::new($false)
  )
}
.\bin\danbooru-tags.exe --batch-workers 8 --batch-file .\batch_tags.json --for-prompt --json --compact
```

新版 CLI 会兼容 UTF-8 BOM；仍建议写无 BOM UTF-8，保证旧 exe 或其他 JSON 工具也能读取。

批量输出按 `results.<id>.confirmed_tags` / `results.<id>.candidate_tags` 读取，`missing` 表示查不到，直接交给 `nltags`。不要把完整 JSON 复述给用户。

`--batch-file` 文件必须是 JSON 对象，包含 `queries` 数组；每条 query 必须有唯一 `id`，用于返回时区分结果。最小格式：

```json
{
  "queries": [
    { "id": "artist", "group": "artist", "keyword": "rella", "limit": 5 },
    {
      "id": "character",
      "group": "character",
      "keyword": "hakurei reimu",
      "limit": 5
    }
  ]
}
```

默认只使用 Rust CLI。Rust CLI 不存在、启动失败、非 0、输出非 JSON 或缺少 `found / confirmed_tags / candidate_tags` 时，停止并报告错误，不切换旧检索实现。

## 调用场景

| 场景                     | 调用方式                                                         | 是否生图                  |
| ------------------------ | ---------------------------------------------------------------- | ------------------------- |
| 查标签/角色/作品/画师    | `.\bin\danbooru-tags.exe --group ...`                              | 否                        |
| 只要随机画师串           | `.\bin\danbooru-tags.exe --random N --json`                        | 否                        |
| 随机角色/服装/场景等候选 | `.\bin\danbooru-tags.exe --random N --group <group> --json`        | 否                        |
| 生图前回填锚点           | `--batch-stdin` 一次查多项                                         | 由 comfyui-animatool 决定 |
| 随机画师生图             | `.\bin\danbooru-tags.exe --random 5 --for-prompt --json --compact` | 由 comfyui-animatool 决定 |

## 随机画师规则

`--random N` 的 `N` 是请求的候选数量，CLI 只提供候选，不替模型选择规模或结果。模型按任务自选 `N`：普通抽卡建议 10–50，硬上限 1–300；只有用户明确要求大量候选时才用 100–300。不传 `--group` 时默认随机画师；带 `--group` 时随机对应 tag 候选。`--random N` 和 `--random N --for-prompt` 语义不同，不能混用：

| 用户意图                       | 正确命令                                                           | 输出字段                            | 用法                            |
| ------------------------------ | ------------------------------------------------------------------ | ----------------------------------- | ------------------------------- |
| 抽 N 个候选画师给模型挑 1 个   | `.\bin\danbooru-tags.exe --random N --json`                        | `random_artists`，长度 N            | 只调用一次；模型从数组里选 1 个 |
| 抽 N 个角色/服装/姿势/场景候选 | `.\bin\danbooru-tags.exe --random N --group clothing --json`       | `random_tags`，长度 N               | 只调用一次；模型按意图筛选      |
| 随机 1 个画师直接用于生图      | `.\bin\danbooru-tags.exe --random 5 --for-prompt --json --compact` | `random_artists_for_prompt`，长度 1 | 直接使用 `[0]`                  |

硬性要求：

- 用户说“抽取 10 个画师然后任选一个”时，只调用一次 `--random 10 --json`。
- 用户说“抽卡随机角色/服装/姿势/场景”时，只调用一次对应 group 的 `--random N --group ... --json`。
- 模型选择的 `N` 必须在 1–300 内；没有数量要求时按任务自选，普通建议 10–50，不要把 50/100 写死成所有场景默认值。
- 不要调用 10 次 `--random 5 --for-prompt --json`。
- `--for-prompt` 是生图回填模式，会故意只返回 1 个画师，避免把长画师串塞进 prompt。
- 随机 tag 候选不得使用 `--for-prompt`；`--for-prompt` 只用于生图回填并会压缩输出。
- 从候选中选画师时，最多选 1 个；用户明确要求混合风格时最多 2 个。
- 随机画师筛选优先使用当前结果中的 `count`；只有用户明确要求覆盖门槛时才补查。

候选预算与 `count`：

- `count` 是训练覆盖与稳定性参考，不是默认硬门槛；不要默认加 `--min-count`。
- 只有用户明确要求高覆盖、高稳定或指定图量门槛时，才使用 `--min-count`。
- 随机画师筛选优先使用当前结果中的 `count`；只有用户明确要求覆盖门槛时才补查。

## 硬性规则

1. 默认主索引只使用 `anima-1.0.csv`；其他历史 CSV 不参与默认生图回填。
2. 画师标签只来自 CSV 原始画师分类，必须保留 `@`。
3. 其他分类不带 `@`，不能当画师标签。
4. `artists_extended.txt` 只在显式 `--extended` 时使用，不用于默认生图回填。
5. 生图回填的标签检索必须使用 `--for-prompt --json --compact`；不要把普通展示输出直接塞进 prompt。
6. `--random N --for-prompt` 只返回 1 个画师给生图分支；`--random N` 是测试串。

## 精细 group

优先用 `--group` 定向检索：

| Group                                  | 用途                                 |
| -------------------------------------- | ------------------------------------ |
| `artist` / `artists`                   | 画师                                 |
| `character` / `characters`             | 角色                                 |
| `series` / `ip` / `copyright`          | 作品/IP                              |
| `appearance` / `body`                  | 发色、发型、瞳色、耳、角、翅膀、体型 |
| `expression`                           | 表情/神态                            |
| `pose` / `action` / `camera`           | 姿势、动作、视角、构图、景别         |
| `clothing` / `outfit`                  | 基础服装                             |
| `clothing_detail` / `detail`           | 服装细节、毛边、兜帽、披风等         |
| `handwear`                             | 手套、爪手套等                       |
| `accessory` / `accessories`            | 配饰                                 |
| `scene` / `background` / `composition` | 场景、背景、天气、构图               |
| `lighting` / `light` / `atmosphere`    | 光影、阴影、逆光、窗影、景深、氛围   |
| `meta`                                 | highres、official art 等元信息       |

## 批量并发与多变体

- `--batch-workers N` 控制批量查询并发，默认 4，建议 4–8。
- 提升准确度时，不要多次调用 CLI；在同一个 `queries` 里放同一锚点的多个变体，例如 `character` / `character_alt`、`artist_pija` / `artist_okara`。
- 模型从批量返回中筛选最匹配的 confirmed/candidate；`missing` 直接交给自然语言，不继续无限补查。
- 精细 group 只是优先过滤，不是绝对真理；部分 Danbooru 服装、构图、属性词实际属于 `general`。
- 查询常见视觉概念时，一次 batch 内放“主词 + 英文/罗马音别名 + 部件拆解”，不要失败后反复单查。
- 中文、日文俗称先翻译/转写成 Danbooru 常用英文或罗马音，再查询；中文原词只能作为辅助变体。
- 对可能被 group 白名单漏掉的概念，同一 batch 可同时放 `group=...` 与 `category=general` 变体。
- `limit 5` 是精确 artist / character / series 查询默认值；模糊服装、动作、场景或俗称候选可用 `limit 10-20`，最终仍只筛少量锚点回填。
- 普通生图最多 4 个语义锚点；每个锚点最多 2–3 个变体；总 query 控制在 12–16 内。
- group 精确过滤无命中时返回的 general 候选只作为 `candidate_tags`；不能当作硬 confirmed 直接批量回填。

示例：用户说“巫女服”，不要只查 `group=clothing keyword=巫女服`。一次 batch 查询：

```json
{
  "queries": [
    {
      "id": "miko_clothing",
      "group": "clothing",
      "keyword": "miko",
      "limit": 5
    },
    {
      "id": "miko_general",
      "category": "general",
      "keyword": "miko",
      "limit": 5
    },
    {
      "id": "miko_hakama",
      "group": "clothing",
      "keyword": "hakama",
      "limit": 5
    }
  ]
}
```

## 输出契约

`--for-prompt --json --compact` 输出：

| 字段             | 用法                                     |
| ---------------- | ---------------------------------------- |
| `found`          | 是否有可确认锚点；`false` 时不要冒充命中 |
| `confirmed_tags` | 高置信锚点，可回填但仍需筛选             |
| `candidate_tags` | 候选项，必须按用户意图筛选               |

单项和批量 compact 都保留 `confirmed_tags / candidate_tags` 分层。batch 额外有 `results`、`missing`、`usage`。

生图回填默认使用 `--compact`，减少上下文占用。

## 回填策略

1. 角色、作品、画师、基础外观优先查到并回填。
2. 服装/配饰/动作/场景/光影先查可确认 tag，再筛选。
3. 若由 `comfyui-animatool` 生图调用，以其最多 4 项批量查询限制为准；场景/光影通常进入 `environment` 或 `nltags`。
4. 复合短语拆成可确认锚点，例如 `fur-trimmed hooded cape` → `fur trim`、`hood`、`cape`。
5. 查不到完整组合时不要编 tag，交给 `nltags`：例如 `She wears a fur-trimmed hooded cape and oversized paw gloves.`。
6. 不要把 `candidate_tags` 整组塞进 prompt。

## 常用命令

```powershell
@'
{"queries":[{"id":"artist","group":"artist","prefix":"@mignon","limit":5}]}
'@ | .\bin\danbooru-tags.exe --batch-workers 8 --batch-stdin --for-prompt --json --compact
.\bin\danbooru-tags.exe --group artist --prefix "@dair" --limit 5 --for-prompt --json --compact
.\bin\danbooru-tags.exe --random 10 --json
.\bin\danbooru-tags.exe --random 20 --group clothing --json
.\bin\danbooru-tags.exe --random 20 --group character --json
.\bin\danbooru-tags.exe --random 5 --for-prompt --json --compact
```

生图默认优先批量查询；单项查询只用于关键补查。

## SQLite / Rust

- 有 `tags_index.sqlite` 时优先查 SQLite，不预读 JSON。
- 精细 group 通过 `tag_groups` 缩小候选，CLI 只做最终排序和输出格式化。
- 更新 CSV 或白名单后运行 `python build_index.py` 重建 JSON 与 SQLite。
