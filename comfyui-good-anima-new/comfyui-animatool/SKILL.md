---
name: comfyui-animatool
description: Use for Anima / ComfyUI-AnimaTool image generation intent. Route image generation requests, require anima-composition-director before every actual generation, validate Danbooru hard anchors for requested or extracted style, character, outfit, pose, scene, lighting, and tags, assemble Anima-compliant English prompts and workflow args, then hand execution to comfyui-manager. Do not use for standalone tag lookup or ComfyUI operations without image generation intent.
---

# Anima / ComfyUI-AnimaTool 生图入口

本 skill 是 Anima 生图策略入口：判断分支、组织视觉决策、校验必要 hard anchors、组装 prompt 和 workflow args。它不直接维护 ComfyUI 服务器，也不执行工作流。

> **路径解析**：引用的 `another-skill/SKILL.md` 路径均相对于当前 skill 所在父目录（即 `comfyui-good-anima-new/`）。直接按路径读取，不要搜索文件名定位。

## 触发与不触发

触发：生成图、画图、出图、reroll、roll 图、抽卡、随机图、指定 Anima/画师风格并要求生成。

不触发：

- 只查角色、作品、画师、tag：只用 `danbooru-tags`。
- 只要随机画师串或随机候选：只用 `danbooru-tags`。
- 查模型、队列、日志、workflow、节点、显存：只用 `comfyui-manager`。

## 读取导航

| 需要处理的事                                               | 读取                                  |
| ---------------------------------------------------------- | ------------------------------------- |
| 普通 Anima 生图默认链路、prompt 组装规则                   | 继续读本文件                          |
| 任何实际生图的画布、镜头、主体位置、光源、景深或脸部可读性 | `anima-composition-director/SKILL.md` |
| 多图、批量、每张不同 prompt、Artist Mixer                  | `references/batch-strategy.md`        |
| 参考图构图/视角/景深迁移                                   | `references/reference-image.md`       |

## 生图分支

读取 anima-composition-director 形成视觉简报 → danbooru-tags 校验锚点 → 组装 args → 冲突检查 → 交接 comfyui-manager。 2. 随机图 / roll / 抽卡：先确认随机生图意图，再读取 `anima-random-gen` 产出参数，复核后交给 `comfyui-manager`。 3. 随机画师并生图：用 `danbooru-tags --random 5 --for-prompt --json --compact` 取 1 个画师，再组装 args。 4. 多画师融合 / artist mixer：读取 `references/batch-strategy.md`，使用 Artist Mixer 工作流；普通“分别用 A/B 出图”不是融合。 5. 用户明确“全 Danbooru tag / 纯 tag / 不加自然语言”：只写 tag，不写 `nltags`。

## 生图前视觉简报

所有实际生图在组装参数前，必须先读取 `anima-composition-director/SKILL.md` 并形成最小视觉简报；不要把简报原样输出给用户，也不要直接写进 `prompt_hint`。

只查 tag、只抽随机候选、只做 ComfyUI 运维时不读取构图 skill。生图时不能用“普通默认链路”跳过构图；渐进式披露的边界是读取 `anima-composition-director/SKILL.md` 主文件，不是默认读取其 `references/`。

接收并使用这些字段：

```json
{
  "canvas": { "width": 1024, "height": 1536 },
  "camera": "upper body, eye-level, normal perspective",
  "composition": "subject centered with simple background separation",
  "lighting": "soft window light from the left",
  "focus": "face sharp and readable, background softly blurred",
  "nltags_sentences": [
    "Keep her face sharp and readable.",
    "Use soft window light from the left."
  ]
}
```

不要一开始套默认竖图。先按画面意图决定 `width/height`，再把主体位置、景别、留白和背景方向回写到 `nltags`。

必须把构图计划内化进最终 args：

- `width` / `height` 来自构图计划，不来自固定默认值。
- `nltags` 至少包含主体位置、景别/镜头、光源方向、焦点/景深中的 2-4 句。
- 单人、头像、半身、角色图默认保护脸部可读性。

## 必查与少查

生图前写最多 4 项检索计划，用 `danbooru-tags` 的 batch 入口一次取回结果。PowerShell 下必须使用 `--batch-file`，不要内联多行 `--batch-json`。

检索目标只限可被 Danbooru 稳定锚定的词。用户明确给出的服装、姿势、场景、光影、旧画风 tag、dataset/style tag 要先查；构图光源方向、复杂氛围、连续动作和叙事关系进入 `nltags`。

必查：

- 角色
- 作品/IP
- 最终选定画师
- 用户明确指定或抽取出的画风 / 服装 / 姿势 / 场景 / 光影 / tag 锚点
- 命名角色的关键外观/服装锚点，但必须先确认来源，不能用角色名盲查反推

不查：

- 构图、抽象氛围、构图光源方向、连续动作、复杂服饰组合
- 用画面气质词查 artist，例如 `dark`、`dramatic`、`corruption`
- 用角色名反查 appearance

## 画师字段与称呼解析

`artist` 是当前工具 schema 的必填字段，画师 tag 必须以 `@` 开头。

### 画师称呼解析

用户给出的画师名可能是中文圈称呼、昵称、社交平台名、画集名或社团名，不一定是 Danbooru/Anima 的 artist tag。不要维护本地固定别名表，也不要把中文昵称按字面直接丢给 tag 检索器。

1. 如果画师输入不是明确 Danbooru artist tag（没有 `@`，或包含"太太/老师/画师/社团"等自然语言称呼），先进行网络搜索确认 canonical artist name、常见别名和公开资料来源。
2. 优先采用官方主页、Pixiv/X/微博资料、百科条目、画集/作品页等互相印证的信息。
3. 将确认出的英文/罗马字画师名转为候选 `@artist`，再用 `danbooru-tags --group artist` 校验。
4. 只有 `danbooru-tags` 返回 confirmed artist 后才写入 prompt；查不到时说明无法确认 tag，或改用最接近的 confirmed artist 候选。
5. 网络搜索只用于解析称呼和别名，不替代 Anima CSV / Danbooru tag 校验。

### 画师选择规则

- 用户指定画师：先用 `danbooru-tags --group artist` 校验，保留其选择。
- 用户要求随机画师：用 `danbooru-tags --random 5 --for-prompt --json --compact` 取 1 个。
- 用户未指定画师：按风格意图从少量候选中选 1 个再校验，不要用抽象气质词查 artist。
  - 日系本子 / 恶堕 / 成年向：优先候选 `@pija`, `@okara`, `@mignon`。
  - 肉感 / 黑丝白丝：优先候选 `@rhasta`, `@mignon`, `@yom`。
  - 中性通用 / 清爽二次元：优先候选 `@mignon`, `@fkey`, `@hiroichi`。
  - 最终只选 1 个并用批量查询校验。
- 默认普通生图只选 1 个画师，并写入 `artist` / 普通 prompt 槽位。
- 多个画师分别出图不等于画师串。用户说"分别用 A/B 画师""每组一个画师""A 画师 N 张、B 画师 N 张"时，走普通默认工作流，为每个 job/prompt 写单个 `@artist`。
- 用户明确要求画师串、多画师融合、artist mixer 或多画师权重混合时，使用 `local/anima-txt2img-aesthetic-lora-artist-mixer`；把不带 `@` 的画师串写入 `artist_chain`，并从 `prompt_11` 移除画师标签。
- `artist_chain` 可用 `(name:weight)` 表达画师之间的相对比例。画师组合优先选风格相近者；需要主辅关系时，可从主画师 `1.0`、辅画师 `0.2–0.4` 这类相对权重开始。
- 画师串建议保持小规模；用户未指定数量时优先 2–4 个。

### 画师时代、代表作与风格锚定

- 用户指定年份、年代、旧画风、新画风、赛璐璐、某时期或某代表作时，必须把 `year` 视为风格控制参数，而不是普通元数据。此时更新 `quality_meta_year_safe` 中的年份，移除冲突的 `newest` / `year 2025`。
- 用户指定某画师的代表作、时期作品或 IP 风格时，可把该代表作/IP 作为 `series` 或 style anchor 使用；先用 `danbooru-tags --group series` 校验可用 tag，查不到时写入 `nltags`，不要伪造 Danbooru tag。
- 同一画师在不同年代可能对应不同画风；组 prompt 前要先判断用户要的是"画师整体风格""某一时期风格"还是"某部代表作风格"。
- 画师/代表作/年份三者不能互相冲突。例如用户要求早期风格时，不要同时保留 `newest`、现代年份和晚期代表作锚点。
- 不确定代表作对应的可用 tag 时，优先保留画师与年份，把代表作描述放入 `nltags`，不要用错误 tag 污染 hard anchors。

### 角色外貌与服装确认

命名角色的默认服装、原作服装、某版本/形态、活动服、制服或特殊配饰不应让模型凭印象补全。不要用角色名反查 `appearance/clothing` 来推断设定。

1. 优先依据用户参考图；没有参考图时，用官方资料、角色页、百科或轻量网络搜索确认关键外观和服装来源。
2. 只把可被 Danbooru 稳定锚定的部分交给 `danbooru-tags` 检索，例如发色、瞳色、发型、制服、巫女服、帽子、武器或明确道具。
3. 查不到的复杂服装结构、材质组合、版本差异和装饰细节写入 `nltags`，不要伪造 Danbooru tag。
4. 多角色时逐个确认外观/服装归属，避免把 A 的服装、发色或配饰写到 B 身上。

## hard anchors 与 `nltags` 分工

hard anchors 放可被 Danbooru 稳定控制的内容：

- 人数、角色、作品、画师
- 发色、瞳色、发型、体型
- 已确认的服装、道具、姿势、表情、视角、光影、场景

`nltags` 放难以用单个 tag 表达的内容：

- 动作连续性、神态细节、叙事关系
- 镜头结构、前景/中景/背景、景深落点、主体脸部可读性
- tag 库缺失的服装/配饰/材质组合
- 光影、空间、氛围的完整描述

同一语义不要在 tags 和 `nltags` 中冲突。Anima 有 tag dropout 训练，不需要塞满所有相关 tag；优先少量硬锚点 + 清晰自然语言补足。

检索锚点数量遵循 danbooru-tags 限制。

## Prompt 默认结构

正向内容必须英文。默认单画师顺序：

```text
quality_meta_year_safe → count → character → series → artist → style → appearance → tags → environment → nltags
```

默认质量前缀：

```text
masterpiece, very aesthetic, best quality, score_9, score_8, highres, absurdres, newest, year 2025, nsfw
```

安全标签必须是 `safe / sensitive / nsfw / explicit` 之一；用户未指定时默认 `nsfw`。

用户明确指定基础工作流、禁用 LoRA 或做对比测试时，基础质量前缀与细节见 `references/prompt-assembly.md`。

默认负面提示词：

```text
worst quality, low quality, score_1, score_2, score_3, blurry, bad anatomy, bad hands, bad feet, extra fingers, missing fingers, distorted face, text, watermark, logo, artist name
```

### period 与 dataset tag

`newest / recent / mid / early / old` 是风格时期控制，不是固定装饰。

- 默认现代二次元风格：保留 `newest, year 2025`。
- 指定年份：优先使用 `year xxxx`，必要时配合最接近 period；不要同时放冲突 period。
- 旧画风/赛璐璐/早期代表作：优先考虑 `old` 或 `early`，并让年份、代表作/IP 和画师时期一致。
- `retro_artstyle`、`faux_retro_artstyle`、`heisei_retro`、`traditional_media` 这类 Danbooru 风格 tag 可以用 `danbooru-tags` 校验后放入 `tags`；不要用检索器查询 `old` 来代表 period。
- `ye-pop`、`deviantart` 等 dataset tag 只在用户明确要求非纯 anime、欧美插画、网络绘画或特定数据域质感时使用；默认 Anima 生图不要主动加入。

## 槽位冲突检查

组装 prompt 时按槽位检查冲突：

- 人数/身份：`solo` 不能和多人互动标签混用；睡眠、昏迷、闭眼时不要写 `looking at viewer`。
- 镜头/景别：`close-up` 与 `full body`、`from above` 与 `from below`、`from front` 与 `from behind` 不要同时出现；需要复杂镜头时改写到 `nltags`。
- 服装/状态：`completely nude` 不和具体服装同用；内衣套装和 `no panties/bottomless` 容易冲突，暴露需求优先拆成上装、下装和穿着状态。
- 动作/姿势：只保留一个主动作和一个辅助姿势；连续动作或角色关系写入 `nltags`。
- 重复标签：同一 tag 不重复写；强调靠顺序和更准确的词，不靠堆叠。
- 标签数量：普通单人 16–30 个核心 tag 即可；复杂主题最多约 40 个，超过时优先删环境、氛围、弱细节。

单人正面图默认需要脸部可读性：除非用户明确要求背影、侧脸、远景或遮脸，否则保留 `looking at viewer` / `facing viewer` 这类可见视线锚点，并在 `nltags` 中说明脸部清晰。

多人图必须明确属性归属：不要只写一组发色、瞳色、服装后接多个角色名；用简短英文句说明每个角色的关键外观、服装、相对位置和主动作。角色之间有互动时，把谁看向谁、谁在前景/后景、谁执行动作写进 `nltags`。

## 权重控制

Anima 官方支持 prompt weighting；官方示例为 `(chibi:2)`。默认不要加权，先靠准确 tag、槽位顺序和短句控制。

- 只有用户明确要求强化/弱化，或某元素多次不稳定时才加权。
- Anima 权重从 `(tag:2)` 级别开始测试；`1.1–1.3` 这类小权重通常不要作为默认方案。
- 不要给角色名、安全标签、质量前缀或整段 `nltags` 默认加权；普通单画师也不要给画师名默认加权。
- 不要大面积加权；同一 prompt 最多处理 1–3 个关键视觉元素。
- 权重只用于可见元素，例如 `(chibi:2)`、`(red eyes:2)`；抽象氛围优先改写为光源、构图或表情。

## `nltags` 画面控制规则

只写画面控制：pose, placement, camera, lighting, depth。

- 默认 2–4 句；复杂构图最多 5 句。
- 单句尽量 8–18 个英文词，最多约 25 个词。
- 每句只控制一个画面要素：动作、姿势、镜头、构图、光源、背景层级、脸部质量。
- 避免文学修辞、比喻、世界观解释、剧情说明、营销式形容词堆叠。
- 抽象情绪应转为可见光影、表情、姿势或构图。
- 不写"debut volume cover / title text placement"这类出版设计说明，除非用户明确要求文字排版。
- 不要把同一语义在 tags 与 `nltags` 重复扩写。
- 背景不是主体时，默认用轻微背景虚化或景深分离主体；背景本身是重点时，只说明层级和景深落点。
- 写法优先使用直接控制句：`Place her full body slightly right of center.` / `Use a low front camera angle.`

## 默认参数

```json
{
  "prompt_11": "完整英文正向提示词",
  "prompt_12": "完整英文负向提示词",
  "width": 1024,
  "height": 1536,
  "batch_size": 1,
  "steps": 30,
  "rtx_vsr_quality": "ULTRA",
  "filename_prefix": "anima/%year%-%month%-%day%/anima_base_v1_0-validated_artist-character_tag"
}
```

`steps=30` 用于普通单人、简单半身、快速测试。用户要求高质量、壁纸、大场景、复杂背景、强光影、1536 高分辨率复杂图时用 `steps=40`。

步数分类：

- 普通单人、简单半身、快速测试、没有强调精修或复杂背景：`steps=30`。
- 高质量、精修、壁纸、大场景、复杂背景、强光影、透明感、细节层次：`steps=40`。
- 高分辨率且包含多人互动、复杂背景或光影叙事：优先 `steps=40`。
- 用户明确要求速度、草稿、测试链路、快速看构图：可保留 `steps=30`。

## 生图前自检

- 已读取 `anima-composition-director/SKILL.md` 并形成视觉简报，画布与构图一致。
- `nltags` 已写入构图计划中的镜头、主体位置、光源、焦点/景深控制。
- 核心角色/作品/画师/tag 已经用 `danbooru-tags` 校验。
- 正向字段是英文，tag 小写空格；`score_9` 这类分数保留下划线。
- `quality_meta_year_safe` 含安全标签。
- `artist` 是 1 个 `@artist name`，除非进入 Artist Mixer。
- 已执行槽位冲突检查：人数/身份、镜头/景别、服装/状态、动作/姿势、重复标签、tags 与 `nltags` 语义冲突。
- 默认只提交 1 张；批量只在用户明确要求时启用。

## 端到端参考

用户：“生成天使心跳的立华奏，三无感，教室窗边柔光。”

最短正确链路：

1. 读取 `anima-composition-director/SKILL.md`，形成窗边构图、画布和脸部清晰控制。
2. 用 `danbooru-tags` batch 校验角色、作品、最终画师，以及必要外观锚点。
3. 柔光、窗边主体位置和背景虚化写入 `nltags`；不要把构图光源方向反复查 tag。
4. 组装 `prompt_11`、`prompt_12`、`width/height`、`steps`、`filename_prefix` 后交给 `comfyui-manager`。

输出 args 结构示例：

```json
{
  "prompt_11": "masterpiece, very aesthetic, best quality, score_9, score_8, highres, absurdres, newest, year 2025, safe, 1girl, kanade tachibana, angel beats!, @validated artist, silver hair, yellow eyes, long hair, school uniform, solo, expressionless, looking at viewer, classroom, window, depth of field, Place her beside the classroom window, facing the viewer. Use soft daylight from the left side. Keep her face centered, sharp, and undistorted. Blur the classroom background gently.",
  "prompt_12": "worst quality, low quality, score_1, score_2, score_3, blurry, bad anatomy, bad hands, bad feet, extra fingers, missing fingers, distorted face, text, watermark, logo, artist name",
  "width": 1024,
  "height": 1536,
  "batch_size": 1,
  "steps": 30,
  "rtx_vsr_quality": "ULTRA",
  "filename_prefix": "anima/%year%-%month%-%day%/anima_base_v1_0-validated_artist-kanade_tachibana"
}
```

## 执行交接

本 skill 只决定语义参数：prompt、负面提示词、画布、steps、批量意图、画师串意图和 filename 语义来源。

执行、队列、缓存、节点护栏交给 `comfyui-manager`：

- 默认使用 `local/anima-txt2img-aesthetic-lora`。
- Artist Mixer 只在用户明确要求多画师融合时使用。
- 基础 workflow 只在用户明确指定基础版、禁用 LoRA、对比测试或排查问题时使用。
