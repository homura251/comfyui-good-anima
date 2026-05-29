---
name: anima-random-gen
description: Generate randomized but Anima-compliant image parameters after comfyui-animatool confirms random-image generation intent. Produces validated artist, prompt fields, resolution, sampler, scheduler, CFG, and preview text.
---

# Anima 随机图生成器

本 skill 只在 `comfyui-animatool` 已确认“随机图 / roll 图 / 抽卡并生图”意图后使用。它产出参数，不直接生图。

## 权威边界

- 画师池与 tag 锚点必须经过 `danbooru-tags` Rust CLI / Anima CSV 索引。
- 本 skill 只产出随机参数；执行交给 `comfyui-manager`。

## 随机检索入口

随机画师与锚点确认必须调用 `danbooru-tags.exe`，并遵循 `danbooru-tags` skill 的执行入口、`--batch-file` 和随机数量规则：

```powershell
.\bin\danbooru-tags.exe --random 5 --for-prompt --json --compact
.\bin\danbooru-tags.exe --random 20 --group clothing --json
```

只用 `confirmed_tags`，`candidate_tags` 必须按随机视觉简报筛选。缺失项交给 `nltags`，不要继续无限补查。

随机候选数量和 `--for-prompt` 语义遵循 `danbooru-tags`；候选池只供内部筛选，最终输出少量被选项。

## 随机前视觉简报

随机图不能只是随机抽 tag。生成随机参数前，先按 `anima-composition-director` 的方法确定主体、镜头、构图、光源、画布和 `nltags_sentences`，再随机画师与 hard anchors。

随机结果必须像一张完整画面的说明，而不是互不相关的标签池采样。

### 分辨率与构图回写

随机图也不要固定套默认竖图。先形成语义草案，再按 `anima-composition-director` 的 canvas fit 选择 `width/height`，最后把主体位置、景别、背景展开方向写回 `nltags`。

如果随机草案和画布不匹配，优先调整构图。`1536x1536` 只用于高信息量中心构图；简单头像、表情图、普通半身图使用 `1024x1024`。

## 输出字段

必须输出一组完整参数给 `comfyui-animatool` 复核：

| 字段                      | 说明                                                                                  |
| ------------------------- | ------------------------------------------------------------------------------------- |
| `positive_prompt_preview` | 最终正向预览，英文                                                                    |
| `quality_meta_year_safe`  | 质量/年份/安全标签                                                                    |
| `count`                   | 人数                                                                                  |
| `artist`                  | 1 个 `@artist name`，最多 2 个                                                        |
| `artist_chain`            | 仅显式画师串/多画师融合时输出；不带 `@`，例如 `wlop, (sakimichan:1.2)`                |
| `appearance`              | 外观硬锚点                                                                            |
| `tags`                    | 已确认的服装/表情/姿势等硬锚点                                                        |
| `environment`             | 已确认的场景/光影短 tag                                                               |
| `nltags`                  | 英文自然语言补充，可为短段落或多句                                                    |
| `neg`                     | 负面提示词                                                                            |
| `width` / `height`        | 根据 `anima-composition-director` 的 `canvas_fit` 选择；默认不主动推荐任一边超过 1536 |
| `steps`                   | 默认 30                                                                               |
| `cfg`                     | 默认 4.5                                                                              |
| `sampler_name`            | 默认 `dpmpp_2m_sde_gpu`                                                               |
| `scheduler`               | 默认 `beta57`                                                                         |

## 随机规则

1. 先形成视觉简报和 prompt 语义草案，再做 `canvas_fit`，最后随机与回写构图。
2. 质量前缀默认：`masterpiece, very aesthetic, best quality, score_9, score_8, highres, absurdres, newest, year 2025, nsfw`（安全标签默认 `nsfw`，用户可覆盖）。
3. 画师必须从 Anima CSV 画师池抽取并带 `@`；默认 1 个。
4. 用户明确要求画师串/多画师融合时，输出不带 `@` 的 `artist_chain`；`positive_prompt_preview` 不重复包含这些画师标签。
5. `environment` 放 2-6 个已确认的场景/光影 tag。
6. `nltags` 用英文补足动作、空间、光影、材质和氛围；不要和 tags 冲突或者重复语义。
7. 姿势、表情、服装要互相兼容；不要生成 `lying` + `sitting`、`open mouth` + `closed mouth` 这类冲突组合。
8. 单人、头像、半身或角色表现图必须考虑脸部可读性，在 `nltags` 中保留简短控制句。
9. 背景不是主体时，优先使用轻微背景虚化或 `depth of field` 分离主体；复杂背景图只控制景深落点。
10. 默认采样参数：30 steps、CFG 4.5、`dpmpp_2m_sde_gpu`、`beta57`。

## 权重规则

Anima 官方支持 prompt weighting，但小权重通常不明显；官方示例为 `(chibi:2)`。

- 默认不要加权，先靠准确 tag、顺序和短句控制。
- 只有用户明确要求强化/弱化，或某元素多次不稳定时才加权。
- 从 `(tag:2)` 级别开始测试；不要默认使用 `1.1–1.3` 小权重。
- 不要给角色名、画师名、安全标签和整段 `nltags` 默认加权。
- 不要大面积加权，避免构图、肢体和细节污染。

## 调用后检查

`comfyui-animatool` 收到随机参数后必须检查：

1. `positive_prompt_preview` 与字段一致。
2. `artist` 为 `@artist name`；若有 `artist_chain`，确认它不带 `@` 且普通 prompt 不重复包含多画师。
3. `quality_meta_year_safe` 有安全标签。
4. `environment` 与 `nltags` 分离且不冲突。
5. `nltags` 的主体位置、景别和背景方向匹配最终 `width/height`。
6. 单人、头像、半身或角色表现图保留脸部清晰控制；背景不是主体时保留轻微背景虚化或景深控制。
7. `steps=30`、`cfg=4.5`、`sampler_name=dpmpp_2m_sde_gpu`、`scheduler=beta57`，除非用户指定覆盖。

## 禁止

- 不要直接输出纯 tag 串冒充随机图参数。

- 不要丢弃 `nltags`。

- 不要把随机画师测试串整体作为画师输入。

- 不要使用固定默认画师组合。
