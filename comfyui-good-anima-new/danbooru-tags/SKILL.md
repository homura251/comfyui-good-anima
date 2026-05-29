---
name: danbooru-tags
description: Search and validate Anima-compatible Danbooru tags, artists, characters, series, appearance, clothing, pose, scene, lighting, style, and prompt hard anchors. Use before Anima image generation when comfyui-animatool needs validated anchors for requested art style, extracted style, character, outfit, pose, scene, lighting, or random candidates; also use for standalone tag/artist/character lookup. Do not decide whether to generate images or execute ComfyUI workflows.
---

# Danbooru 标签检索

本 skill 是 Anima / Danbooru 锚点检索层。它只返回检索结果，不决定是否生图、不组装完整 prompt、不执行 ComfyUI。

## 默认职责

- 确认 Anima 可用的 Danbooru 角色、作品、画师和视觉 hard anchors。
- 生图前验证用户指定或抽取出的画风、角色、服装、姿势、场景、光影和可标签化外观锚点。
- 为 `comfyui-animatool` 提供少量已确认 tag 和候选 tag。
- 响应用户的独立查询：查 tag、查画师、查角色、随机画师、随机 tag 候选。
- 不读取大 CSV、SQLite、JSON 索引、日志、tmp、批处理样例，除非正在维护检索器。

## 读取导航

| 需要处理的事                           | 读取                        |
| -------------------------------------- | --------------------------- |
| 常规单查、批查、随机候选、group 选择   | 继续读本文件                |
| 重建索引、Rust/SQLite 维护、数据源排查 | `references/maintenance.md` |

## 调用场景

| 场景                                                  | 命令形态                                                       | 是否生图                    |
| ----------------------------------------------------- | -------------------------------------------------------------- | --------------------------- |
| 查标签/角色/作品/画师                                 | `./bin/danbooru-tags.exe --group ... --json --compact`         | 否                          |
| 生图前确认角色/作品/画师/服装/姿势/场景/style anchors | `--batch-file <batch_tags.json> --for-prompt --json --compact` | 由 `comfyui-animatool` 决定 |
| 只要随机画师候选                                      | `--random N --json`                                            | 否                          |
| 随机角色/服装/姿势/场景候选                           | `--random N --group <group> --json`                            | 否                          |
| 随机画师并直接用于生图                                | `--random 5 --for-prompt --json --compact`                     | 由 `comfyui-animatool` 决定 |

## 权威边界

- 默认数据只来自 Anima CSV / 本地索引。
- 画师标签只来自 CSV 原始 artist 分类，必须保留 `@`。
- 其他分类不带 `@`，不能当画师标签。
- `artists_extended.txt` 只在明确 `--extended` 或维护场景使用，不参与默认生图回填。
- 角色查询只返回角色 tag、aliases 和 count；不要把 aliases 当发色、服装或道具描述。
- `confirmed_tags` 可回填但仍需按意图筛选。
- 查不到的复合概念交给 `nltags`，不要编造 Danbooru tag。
- 指定画风、抽取画风、角色、服装、姿势、场景、光影或 tag 锚点用于生图前，必须先经本检索器确认；确认不了的内容只能进入 `nltags` 或向用户说明。

## 精细 group 选择

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
| `clothing_detail` / `detail`           | 服装细节、毛边、兜帽、披风           |
| `handwear`                             | 手套、爪手套等                       |
| `accessory` / `accessories`            | 配饰                                 |
| `scene` / `background` / `composition` | 场景、背景、天气、构图               |
| `lighting` / `light` / `atmosphere`    | 光影、阴影、逆光、窗影、景深、氛围   |
| `meta`                                 | highres、official art 等元信息       |

画师标签只来自 CSV 原始 artist 分类，必须保留 `@`。其他分类不带 `@`，不能当画师标签。

精细 group 是优先过滤，不是绝对真理。一次 batch 同时放 `group=...` 与 `category=general` 变体。中文/日文俗称先转写为英文/罗马音。

## 执行入口

默认优先 Rust CLI。必须从当前 skill 真实目录执行，不要从其他 skill 目录找 `bin`。

`DANBOORU_TAGS_DIR` 是包含 `bin/danbooru-tags.exe`、`anima-1.0.csv`、`tags_index.sqlite` 的目录。

路径解析规则：

- 已读取本 `SKILL.md` 时，优先使用该文件所在目录。
- 已在 skill 目录中执行命令时，优先使用当前目录。
- 已在父级 skill 目录时，可解析 `.\danbooru-tags`。
- 自动化脚本可显式设置环境变量 `DANBOORU_TAGS_DIR`。
- 不要写死具体用户名、平台目录或绝对路径；通过 `$env:DANBOORU_TAGS_DIR`、当前目录或向上发现 `skills/` 容器推导。

PowerShell 兜底解析：

```powershell
function Test-DanbooruTagsDir($Path) {
  return (Test-Path (Join-Path $Path "bin/danbooru-tags.exe")) -and (Test-Path (Join-Path $Path "tags_index.sqlite"))
}

function Find-DanbooruTagsDirFromSkills($Start) {
  $cursor = (Resolve-Path $Start).Path
  while ($cursor) {
    # 优先搜索 skills/ 容器目录（兼容旧结构）
    $skillsDirs = Get-ChildItem -LiteralPath $cursor -Directory -Recurse -Depth 2 -Filter "skills" -ErrorAction SilentlyContinue
    foreach ($skillsDir in $skillsDirs) {
      $candidate = Join-Path $skillsDir.FullName "danbooru-tags"
      if (Test-DanbooruTagsDir $candidate) { return (Resolve-Path $candidate).Path }
    }
    # 回退：平铺结构（如 comfyui-good-anima-new），直接检查当前目录及子目录
    $flatCandidate = Join-Path $cursor "danbooru-tags"
    if (Test-DanbooruTagsDir $flatCandidate) { return (Resolve-Path $flatCandidate).Path }
    $parent = Split-Path $cursor -Parent
    if ($parent -eq $cursor) { break }
    $cursor = $parent
  }
  return $null
}

$DANBOORU_TAGS_DIR = if ($env:DANBOORU_TAGS_DIR) {
  $env:DANBOORU_TAGS_DIR
} elseif (Test-DanbooruTagsDir ".") {
  (Get-Location).Path
} elseif (Test-DanbooruTagsDir "./danbooru-tags") {
  (Resolve-Path "./danbooru-tags").Path
} elseif ($found = Find-DanbooruTagsDirFromSkills ".") {
  $found
} else {
  throw "Set DANBOORU_TAGS_DIR or run from a directory that can discover skills/danbooru-tags"
}
Push-Location "$DANBOORU_TAGS_DIR"  # 后续 CLI 命令依赖此 CWD；调用完成后可用 Pop-Location 恢复
$DANBOORU_RUNTIME_DIR = if ($env:DANBOORU_TAGS_RUNTIME_DIR) {
  $env:DANBOORU_TAGS_RUNTIME_DIR
} elseif ($env:SKILL_RUNTIME_ROOT) {
  Join-Path $env:SKILL_RUNTIME_ROOT "danbooru-tags"
} else {
  $cursor = (Resolve-Path $DANBOORU_TAGS_DIR).Path
  $runtimeRoot = $null
  while ($cursor) {
    $candidate = Join-Path $cursor "runtime"
    if (Test-Path -LiteralPath $candidate) { $runtimeRoot = $candidate; break }
    $parent = Split-Path $cursor -Parent
    if ($parent -eq $cursor) { break }
    $cursor = $parent
  }
  if ($runtimeRoot) {
    Join-Path $runtimeRoot "danbooru-tags"
  } else {
    Join-Path (Resolve-Path (Join-Path $DANBOORU_TAGS_DIR "..\..")).Path "runtime\danbooru-tags"
  }
}
New-Item -ItemType Directory -Force -Path $DANBOORU_RUNTIME_DIR | Out-Null
```

## 常用命令

单项查询：

```powershell
./bin/danbooru-tags.exe --group artist --prefix "@mignon" --limit 5 --for-prompt --json --compact
./bin/danbooru-tags.exe --group character --keyword "kanade tachibana" --limit 5 --for-prompt --json --compact
./bin/danbooru-tags.exe --group series --keyword "angel beats" --limit 5 --for-prompt --json --compact
```

随机候选：

```powershell
./bin/danbooru-tags.exe --random 10 --json
./bin/danbooru-tags.exe --random 20 --group clothing --json
./bin/danbooru-tags.exe --random 5 --for-prompt --json --compact
```

生图前多锚点检索优先用 batch 文件。不要内联复杂多行 `--batch-json`：

```powershell
$batchDir = Join-Path $DANBOORU_RUNTIME_DIR "batch"
New-Item -ItemType Directory -Force -Path $batchDir | Out-Null
$batchFile = Join-Path $batchDir "batch_tags.json"
$batchJson = @'
{
  "queries": [
    { "id": "character", "group": "character", "keyword": "kanade tachibana", "limit": 5 },
    { "id": "series", "group": "series", "keyword": "angel beats", "limit": 5 },
    { "id": "artist", "group": "artist", "prefix": "@mignon", "limit": 5 }
  ]
}
'@
# 优先 PS7 UTF-8 no BOM；PS5 带 BOM 只是最后兜底
if ($PSVersionTable.PSVersion.Major -ge 7) {
  $batchJson | Set-Content -LiteralPath $batchFile -Encoding utf8
} else {
  # PS5 必须带 BOM，否则 CLI 解析失败
  $batchJson | Set-Content -LiteralPath $batchFile -Encoding UTF8
}
./bin/danbooru-tags.exe --batch-workers 8 --batch-file "$batchFile" --for-prompt --json --compact
```

## 批量并发与多变体

- `--batch-workers N` 控制批量查询并发，建议 4-8；过高会增加 SQLite 连接竞争。
- `--batch-file` 必须是 JSON 对象，包含 `queries` 数组；每条 query 必须有唯一 `id`。
- 提升准确度时，不要多次调用 CLI；在同一个 `queries` 里放同一锚点的多个变体。
- 普通生图最多 4 个语义锚点；每个锚点最多 2-3 个变体；总 query 控制在 12-16 内。
- `--compact` 结果只读 JSON 并筛选，不向用户复述完整检索过程。
- group 精确过滤无命中时返回的 general 候选只作为 `candidate_tags`。

## 回填策略

采用"Danbooru 锚点确认 + nltags 补足"：

1. 角色、作品、画师、基础外观优先查到并回填。
2. 服装/配饰/动作/场景/光影先查可确认 tag，再筛选。
3. 复合短语拆成可确认锚点，例如 `fur-trimmed hooded cape` 拆成 `fur trim`、`hood`、`cape`。
4. 查不到完整组合时不要编 tag，交给 `nltags`。
5. 不要把 `candidate_tags` 整组塞进 prompt。
6. 不要堆 30+ 个松散 tag；少量硬锚点更稳。

## 随机规则

- `--random N` 的 `N` 是候选数量，普通建议 10-50，硬上限 1-300。
- `--random N --for-prompt` 只返回 1 个可直接用于生图的画师；不要把它当候选池。
- 用户说“抽 N 个候选然后选一个”时，只调用一次 `--random N --json`。
- 随机角色、服装、姿势、场景候选使用 `--random N --group <group> --json`，不要加 `--for-prompt`。
- 从随机画师候选中最多选 1 个；用户明确要求混合风格时最多 2 个。
- `count` 是训练覆盖参考，不是默认硬门槛；不要默认加 `--min-count`。
- 候选池只供内部筛选，最终通常展示 1-5 个关键选择，不复述完整 JSON。

| 用户意图                       | 命令                                                               | 读取字段                    | 规则                      |
| ------------------------------ | ------------------------------------------------------------------ | --------------------------- | ------------------------- |
| 抽 N 个候选画师再选 1 个       | `./bin/danbooru-tags.exe --random N --json`                        | `random_artists`            | 只调用一次，模型筛选 1 个 |
| 抽 N 个角色/服装/姿势/场景候选 | `./bin/danbooru-tags.exe --random N --group clothing --json`       | `random_tags`               | 不加 `--for-prompt`       |
| 随机 1 个画师直接用于生图      | `./bin/danbooru-tags.exe --random 5 --for-prompt --json --compact` | `random_artists_for_prompt` | 直接使用第 1 个           |

## 输出契约

`--for-prompt --json --compact` 输出按以下字段读取：

| 字段             | 用法                                     |
| ---------------- | ---------------------------------------- |
| `found`          | 是否有可确认锚点；`false` 时不要冒充命中 |
| `confirmed_tags` | 高置信锚点，可回填但仍需筛选             |
| `candidate_tags` | 候选项，必须按用户意图筛选               |
| `missing`        | batch 中查不到的项，交给 `nltags`        |

默认只使用 Rust CLI。Rust CLI 不存在、启动失败、非 0、输出非 JSON 或缺少关键字段时，停止并报告错误，不切换旧实现。
