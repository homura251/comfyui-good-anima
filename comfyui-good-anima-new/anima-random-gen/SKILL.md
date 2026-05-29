---
name: anima-random-gen
description: Generate randomized but Anima-compliant image parameters only after comfyui-animatool confirms random-image generation intent. Produces candidate artist, prompt fields, canvas, sampler, scheduler, CFG, and preview text. Do not use for standalone random tag lookup without image generation intent.
---

# Anima 随机图生成器

本 skill 只在 `comfyui-animatool` 已确认“随机图 / roll 图 / 抽卡并生图”意图后使用。它产出参数，不直接生图。

## 默认职责

- 产出 Anima 兼容的随机图参数（画师、prompt、画布、采样参数）。
- 调用 `anima-composition-director` 形成随机前视觉简报。
- 通过 `danbooru-tags` 获取随机画师和 hard anchor 候选。
- 不替代 `comfyui-animatool` 的最终复核，不直接生图。

## 读取导航

| 需要处理的事                               | 读取                          |
| ------------------------------------------ | ----------------------------- |
| 随机图生成、参数产出、调用后检查、禁止组合 | 继续读本文件                  |
| 随机池策略、脚本字段、扩展随机配置         | `references/random-policy.md` |

> **路径解析**：引用的 `another-skill/SKILL.md` 路径均相对于当前 skill 所在父目录（即 `comfyui-good-anima-new/`）。直接按路径读取，不要搜索文件名定位。

## 权威边界

- Prompt 规则以 Anima 生图入口的规则为准。
- 随机画师与 hard anchors 必须通过 `danbooru-tags` Rust CLI / Anima CSV 索引。
- 默认执行链路是 `comfyui-manager` 的 `local/anima-txt2img-aesthetic-lora`。
- 本 skill 不替代 `comfyui-animatool` 的最终复核。

## 默认流程

1. 先读取/调用 `anima-composition-director`，形成随机图语义草案：主体、镜头、构图、光源、画布、脸部可读性。
2. 再用 `danbooru-tags` 获取随机画师或随机 hard anchor 候选。
3. 按兼容性筛选候选，不复述完整候选 JSON。
4. 输出完整参数给 `comfyui-animatool` 复核。

随机图不能只是随机抽 tag。输出必须形成连贯的画面描述，不得输出互不相关的 tag 列表。

## 随机前视觉简报

随机前先确定语义草案，不要先抽一堆互不相关 tag：

```json
{
  "subject": "1girl character illustration",
  "canvas": { "width": 1024, "height": 1536 },
  "camera": "upper body or full body, eye-level",
  "composition": "subject centered with clean background separation",
  "lighting": "soft frontal or window light",
  "focus": "face sharp and readable, background softly blurred"
}
```

分辨率与构图回写：

- 头像/半身/表情图：`1024x1024`。
- 单人全身、立绘、手机壁纸：`1024x1536`。
- 多人互动、宽景、横向动作：`1536x1024`。
- 高信息量中心构图、复杂服装：`1536x1536`。

## 随机检索入口

执行前必须先解析 `DANBOORU_TAGS_DIR`（读取 `danbooru-tags/SKILL.md` 的"执行入口"段，或设置环境变量 `DANBOORU_TAGS_DIR`），确保从正确的 `danbooru-tags` 目录调用 CLI。解析完成后：

```powershell
./bin/danbooru-tags.exe --random 5 --for-prompt --json --compact
./bin/danbooru-tags.exe --random 20 --group clothing --json
```

规则：

- 随机候选 `N` 普通建议 10-50，硬上限 1-300。
- 只有用户明确要大量抽卡候选时才用 100-300。
- 随机 tag 候选不加 `--for-prompt`。
- `candidate_tags` 必须按视觉简报筛选；缺失项交给 `nltags`。

## 输出字段

必须输出一组完整参数：

| 字段                      | 说明                                |
| ------------------------- | ----------------------------------- |
| `positive_prompt_preview` | 最终正向预览，英文                  |
| `quality_meta_year_safe`  | 质量/年份/安全标签                  |
| `count`                   | 人数                                |
| `artist`                  | 1 个 `@artist name`                 |
| `artist_chain`            | 仅显式多画师融合时输出，不带 `@`    |
| `appearance`              | 外观 hard anchors                   |
| `tags`                    | 已确认服装/表情/姿势等 hard anchors |
| `environment`             | 已确认场景/光影短 tag               |
| `nltags`                  | 英文自然语言补充                    |
| `neg`                     | 负面提示词                          |
| `width` / `height`        | 根据画布选择                        |
| `steps`                   | 默认 30                             |
| `cfg`                     | 默认 4.5                            |
| `sampler_name`            | 默认 `dpmpp_2m_sde_gpu`             |
| `scheduler`               | 默认 `beta57`                       |
| `batch_size`              | 默认 1                              |
| `rtx_vsr_quality`         | 默认 `ULTRA`                        |

## 调用后检查

`comfyui-animatool` 收到随机参数后必须检查：

- `positive_prompt_preview` 与字段一致。
- `artist` 为 `@artist name`；若有 `artist_chain`，确认它不带 `@`。
- `quality_meta_year_safe` 有安全标签。
- `environment` 与 `nltags` 分离且不冲突。
- `nltags` 的主体位置、景别和背景方向匹配最终 `width/height`。
- 单人、头像、半身或角色表现图保留脸部清晰控制。

## 禁止组合

随机参数必须检查以下冲突组合是否存在：

- `lying` + `sitting`
- `open mouth` + `closed mouth`
- `close-up` + `full body`
- 单人图但使用多人互动描述
- 服装和裸体状态冲突
- 姿势、表情、服装互相不兼容（如 `running` + `kneeling`）

## 禁止

- 不要直接输出纯 tag 串冒充随机图参数。
- 不要丢弃 `nltags`。
- 不要把随机画师测试串整体作为画师输入。
- 不要使用固定默认画师组合。
