---
name: anima-composition-director
description: Convert Anima image-generation intent, tags, references, or rough prompts into concrete composition decisions. Use with comfyui-animatool when the task needs better camera framing, aspect ratio, subject placement, lighting, depth of field, face readability, or reference-image composition transfer before assembling Anima prompts.
---

# Anima Composition Director

## 默认职责

本 skill 只做构图决策（画布、镜头、主体位置、光源、景深），输出短英文控制句和 JSON。它不搜索 tag，不执行 ComfyUI，不组装完整 prompt。

## Goal

将生图意图转成简短视觉计划：画布、镜头、主体位置、层次、光源、景深，以及可传给 `nltags` 的短英文控制句。

Do not write literary mood paragraphs. Describe the picture layout.

## Inputs to consider

- User hard constraints: size, aspect ratio, platform use, reference image scope.
- Subject: number of characters, body visibility, action, props, outfit complexity.
- Scene: indoor/outdoor, close space/wide space, background importance.
- Identity risk: whether face, hair, outfit, or emblem must stay readable.
- Output purpose: quick test, wallpaper, cover-like key visual, character sheet, interaction scene.

## 读取导航

| 需要处理的事       | 读取                           |
| ------------------ | ------------------------------ |
| 做一次完整构图决策 | 从头读至"Self-check"           |
| 只查画布规则       | 跳到"Canvas fit"               |
| 只查镜头语法       | 跳到"Camera grammar"           |
| 只查参考图构图迁移 | 跳到"Reference image transfer" |
| 查看输出格式       | 跳到"Output contract"          |

## Canvas fit

Choose after the semantic draft is clear. If the user gave a size, keep it and adapt composition.

规则：用户允许某分辨率 ≠ 所有图都用该分辨率。每张图按下表按构图语义独立选择画布，禁止一刀切复用。

| Canvas          | Use when                                           |
| --------------- | -------------------------------------------------- |
| `1536x1024` 3:2 | 多人互动、横向动作、宽景背景、左右空间关系         |
| `1024x1536` 2:3 | 单人全身、立绘、手机壁纸、纵向姿态                 |
| `1536x864` 16:9 | 电影感宽银幕、远景、横向环境叙事、桌面壁纸预览     |
| `1536x1152` 4:3 | 室内中景、互动场景、人物占比高但仍保留环境         |
| `1152x1536` 3:4 | 角色为主、少量环境叙事、比 2:3 更稳的竖图          |
| `1536x768` 2:1  | 超宽场景、横向队列、压迫感风景；必须保护脸部可读性 |
| `1024x1024` 1:1 | 头像、半身、中心主体、简单稳定构图                 |
| `1536x1536` 1:1 | 高信息量中心构图、复杂服装、道具环绕、丰富背景     |

Do not recommend `1920x1080` for initial Anima base1.0 generation. Larger output belongs to upscale.

## Layout modes

Choose one image type before camera and canvas decisions. Do not mix modes unless the user asks.

| Mode                                   | Use when                       | Composition priority                                                       |
| -------------------------------------- | ------------------------------ | -------------------------------------------------------------------------- |
| Character illustration                 | 单人或角色展示                 | readable face, outfit silhouette, clean background separation              |
| Key visual / poster                    | 主视觉、宣传图、封面感         | strong focal point, silhouette, controlled negative space only when needed |
| Event CG / visual novel CG             | 剧情事件图、角色互动、场景瞬间 | relationship, gaze, hands, props, motivated light source                   |
| Manga single panel                     | 单格漫画感、动作峰值           | peak action, diagonal flow, expression and hand readability                |
| Cinematic still                        | 电影定格、强镜头感             | shot distance, camera angle, foreground/midground/background depth         |
| Concept art / environment illustration | 场景设定、环境叙事             | scale, foreground/midground/background, atmospheric depth                  |
| Card / splash art                      | 卡面、必杀技、强冲击图         | dynamic pose, prop silhouette, effects around but not over the face        |
| Character sheet                        | 设定展示、服装细节             | neutral pose, clean lighting, readable design details                      |

Mode rules:

- `illustration` is the broad category; specify a narrower mode when composition needs it.
- `event CG` needs a readable story moment, not prose or backstory.
- `manga single panel` is one image only; do not describe multiple panels unless requested.
- `cinematic still` may borrow film shot terms, but must stay a static frame.
- If unsure, default to `character illustration` for simple character requests and `event CG` for interaction scenes.

## Camera grammar

每行选一个值，除非用户明确需要特殊镜头：

- Distance: `close-up`, `upper body`, `cowboy shot`, `full body`, `wide shot`.
- Angle: `eye-level`, `low front angle`, `high angle`, `side view`, `three-quarter view`, `over-shoulder view`, `top-down view`.
- Lens feel: `normal perspective` by default; use `wide-angle` only for strong space or action. Avoid fisheye unless requested.
- Focus technique: `shallow depth of field`, `deep focus`, `rack focus look`, or `soft background blur`.
- Face rule: if identity matters, include `Keep the face sharp and readable.`

Avoid contradictions: no `close-up` with `full body`; no `from above` with `from below`; no wide shot if the face must dominate.

- One frame gets one primary camera idea; do not stack `low angle`, `top-down`, and `over-shoulder` together.
- Convert movement terms into static layout: `tracking shot` means subject offset plus background leading lines; `push-in` means closer framing and stronger face emphasis; `orbit` means three-quarter view with curved background cues.
- For action, describe the peak pose and motion direction, not a sequence of events.

## Composition patterns

Use one clear pattern:

- Center: stable portrait, icon, square image, character focus.
- Rule of thirds: character plus readable environment, poster-like balance.
- Diagonal: action, weapons, movement, falling, chase, dynamic pose.
- Layered depth: foreground object, midground subject, background scene.
- Negative space: title area, sky, empty corridor, visual breathing room.
- Symmetry: ritual, shrine, throne, formal scene, stillness.

State subject placement and background direction. Example: `Place the subject slightly right of center, with the corridor receding to the left.`

Visual-design rules:

- Establish one focal point first; secondary props and background must support it.
- Keep face and hands readable; move overlaps away from them.
- Put the clearest silhouette against the simplest background area.
- When clothing is complex, simplify the background and keep the silhouette readable.
- Use clear value separation, controlled edges, and one dominant color palette plus one accent color.

## Lighting and depth

Define light as visible geometry, not abstract mood:

- Key light direction: left / right / above / below / behind / window side.
- Rim light only when it helps silhouette separation.
- Fill light only when shadows hide the face or outfit identity.
- Background light should not overpower the face.
- Use background blur when scene detail competes with identity.
- For 2:1 or wide shots, explicitly protect face readability.
- Avoid stacking many post-process words; pick one: bloom, vignette, lens flare, film grain, or chromatic aberration.
- Use vignette only to guide the eye toward the subject, not as a default style word.

## Reference image transfer

If a reference image is used only for composition, extract only:

- aspect ratio
- camera distance
- camera angle
- subject position
- depth layers
- light direction
- blur / focus behavior

Do not copy reference character, outfit, color scheme, props, or setting unless the user asks.

## Output contract

Return or pass forward this compact structure:

```json
{
  "prompt_semantic_draft": "1girl full body, classroom window, quiet pose, soft daylight",
  "canvas_fit": "1536x1024 horizontal composition for environment and subject placement",
  "final_composition": "subject slightly right of center; window and classroom depth open to the left",
  "canvas": {
    "width": 1536,
    "height": 1024,
    "reason": "horizontal interaction scene"
  },
  "camera": "full body, low front angle, normal perspective",
  "composition": "subject slightly right of center; background opens to the left",
  "lighting": "soft window light from the left, subtle rim light",
  "focus": "face sharp and readable, background softly blurred",
  "nltags_sentences": [
    "Place her full body slightly right of center.",
    "Use a low front camera angle with normal perspective.",
    "Keep her face sharp and readable, with a softly blurred background."
  ]
}
```

Field rules:

- `prompt_semantic_draft`: compact visual content summary before tag assembly.
- `canvas_fit`: why this canvas matches the draft; mention conflicts if adapting a user-fixed size.
- `final_composition`: the final layout sentence that must match `width` and `height`.

Rules for `nltags_sentences`:

- 2–5 sentences.
- 8–18 English words per sentence.
- One sentence controls one thing: pose, camera, placement, lighting, depth, or face quality.
- Use at most one camera term sentence and at most one focus/depth sentence.
- No metaphors, backstory, destiny, personality analysis, or vague mood stacking.
- No video-only instructions such as `the camera pans`, `the camera tracks`, or `then she turns`.
- Prefer concrete verbs: `place`, `use`, `keep`, `frame`, `light`, `blur`.

## Self-check

Before returning the plan:

- Canvas matches the final prompt idea.
- Subject size matches camera distance.
- Face readability is protected when identity matters.
- Background detail does not fight the subject.
- `nltags_sentences` are short layout controls, not prose.
