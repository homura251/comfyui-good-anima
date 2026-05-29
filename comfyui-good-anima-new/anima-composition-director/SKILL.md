---
name: anima-composition-director
description: Convert Anima image-generation intent, tags, references, or rough prompts into concrete composition decisions. Required by comfyui-animatool before every actual Anima image generation (and also called by anima-random-gen for random pre-roll visual briefing) to decide canvas, camera framing, subject placement, lighting, depth of field, face readability, and reference-image composition transfer. For standalone non-generation planning, use only when composition decisions are requested.
---

# Anima Composition Director

Use this skill before every final Anima prompt assembly initiated by `comfyui-animatool`. It does not search tags and does not run ComfyUI.

For standalone non-generation tasks, use it only when the user asks for composition, camera, lighting, canvas choice, or reference-image layout transfer.

参考图只用于构图时，读取 ## Reference image transfer 节；不要复制角色、服装、配色、道具或场景。

## Goal

Turn a semantic draft into a small visual plan:

1. Decide the canvas from the final image idea.
2. Choose camera distance and angle.
3. Place the subject in the frame.
4. Define foreground / midground / background.
5. Set light direction and depth of field.
6. Emit short English control sentences for `nltags`.

Do not write literary mood paragraphs. Describe the picture layout.

## Inputs to consider

- User hard constraints: size, aspect ratio, platform use, reference image scope.
- Subject: number of characters, body visibility, action, props, outfit complexity.
- Scene: indoor/outdoor, close space/wide space, background importance.
- Identity risk: whether face, hair, outfit, or emblem must stay readable.
- Output purpose: quick test, wallpaper, cover-like key visual, character sheet, interaction scene.

## Fast canvas choices

| Canvas      | Use when                               |
| ----------- | -------------------------------------- |
| `1536x1024` | 多人互动、横向动作、宽景背景           |
| `1024x1536` | 单人全身、立绘、手机壁纸               |
| `1536x864`  | 电影感宽银幕、远景、桌面壁纸预览       |
| `1536x1152` | 室内中景、互动场景、环境仍重要         |
| `1152x1536` | 角色为主、少量环境叙事                 |
| `1536x768`  | 超宽场景、横向队列；必须保护脸部可读性 |
| `1024x1024` | 头像、半身、中心主体                   |
| `1536x1536` | 高信息量中心构图、复杂服装、道具环绕   |

Do not recommend `1920x1080` for initial Anima base1.0 generation. Larger output belongs to upscale.

## Default decisions

- Simple character request: default to `character illustration`.
- Interaction scene: default to `event CG`.
- One frame gets one primary camera idea; do not stack conflicting angles.
- If identity matters, include `Keep the face sharp and readable.`
- Background not primary: use soft background blur or shallow depth separation.
- Complex clothing: simplify background before reducing identity tags.

For a simple one-character request with no fixed size, no reference image, no complex background, and no special camera demand, use these defaults:

- Canvas: `1024x1536` (portrait/avatar/half-body: `1024x1024`; full-body standing: `1024x1536`)
- Camera: `upper body or full body, eye-level, normal perspective`
- Composition: `subject centered with clean background separation`
- Lighting: `soft frontal or window light`
- Focus: `face sharp and readable, background softly blurred`

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

## Camera grammar

Pick one value from each row unless the user explicitly needs a special shot:

- Distance: `close-up`, `upper body`, `cowboy shot`, `full body`, `wide shot`.
- Angle: `eye-level`, `low front angle`, `high angle`, `side view`, `three-quarter view`, `over-shoulder view`, `top-down view`.
- Lens feel: `normal perspective` by default; use `wide-angle` only for strong space or action. Avoid fisheye unless requested.
- Focus: `shallow depth of field`, `deep focus`, `rack focus look`, or `soft background blur`.

Avoid contradictions: no `close-up` with `full body`; no `from above` with `from below`; no wide shot if the face must dominate.

## Composition patterns

Use one clear pattern:

- Center: stable portrait, icon, square image, character focus.
- Rule of thirds: character plus readable environment, poster-like balance.
- Diagonal: action, weapons, movement, falling, chase, dynamic pose.
- Layered depth: foreground object, midground subject, background scene.
- Negative space: title area, sky, empty corridor, visual breathing room.
- Symmetry: ritual, shrine, throne, formal scene, stillness.

State subject placement and background direction. Example: `Place the subject slightly right of center, with the corridor receding to the left.`

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

## Output contract

Return or pass forward this compact structure:

```json
{
  "prompt_semantic_draft": "1girl full body, classroom window, quiet pose, soft daylight",
  "canvas_fit": "1024x1536 vertical composition for single character display",
  "final_composition": "subject centered; classroom window light enters from the left",
  "canvas": {
    "width": 1024,
    "height": 1536,
    "reason": "vertical single character illustration"
  },
  "camera": "upper body, eye-level, normal perspective",
  "composition": "subject centered with clean background separation",
  "lighting": "soft window light from the left",
  "focus": "face sharp and readable, background softly blurred",
  "nltags_sentences": [
    "Place her upper body in the center of the frame.",
    "Use soft window light from the left side.",
    "Keep her face sharp and readable, with a softly blurred background."
  ]
}
```

字段规则：

| 字段                    | 规则                                               |
| ----------------------- | -------------------------------------------------- |
| `prompt_semantic_draft` | prompt 组装前的短语义草案，不是最终 prompt         |
| `canvas_fit`            | 说明画布为什么匹配需求；用户固定尺寸时说明适配方式 |
| `final_composition`     | 最终布局一句话，必须与 `width/height` 一致         |
| `canvas`                | 只给 `width`、`height` 和简短原因                  |
| `camera`                | 一个主镜头，不堆叠矛盾视角                         |
| `composition`           | 主体位置、留白、背景展开方向                       |
| `lighting`              | 光源方向或光质，不写抽象情绪                       |
| `focus`                 | 脸、手、主体、背景虚化等可见焦点                   |
| `nltags_sentences`      | 2-5 句短英文画面控制句，交给 prompt 的 `nltags`    |

## nltags sentence rules

- 2-5 sentences.
- 8-18 English words per sentence.
- One sentence controls one thing: pose, camera, placement, lighting, depth, or face quality.
- Use at most one camera term sentence and at most one focus/depth sentence.
- No metaphors, backstory, destiny, personality analysis, or vague mood stacking.
- No video-only instructions such as `the camera pans`, `the camera tracks`, or `then she turns`.

## Reference image transfer

If a reference image is used only for composition, extract only:

- aspect ratio
- camera distance
- camera angle
- subject position
- foreground / midground / background depth layers
- light direction
- blur / focus behavior

Do not copy reference character, outfit, color scheme, props, or setting unless the user asks.

## Self-check

- Canvas matches the final prompt idea.
- Subject size matches camera distance.
- Face readability is protected when identity matters.
- Background detail does not fight the subject.
- `nltags_sentences` are short layout controls, not prose.
