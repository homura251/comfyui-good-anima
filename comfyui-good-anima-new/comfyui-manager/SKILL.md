---
name: comfyui-manager
description: Manage ComfyUI server, models, workflows, queues, logs, dependencies, and workflow execution via comfyui-skill. Use when the agent must execute an already prepared ComfyUI workflow, inspect local ComfyUI state, or perform ComfyUI operations. For Anima prompt strategy, use comfyui-animatool first.
---

# ComfyUI Manager

本 skill 是 ComfyUI 执行和运维层。它不负责 Anima prompt 策略，不自行改写 prompt，不决定随机 tag 或构图。

## 默认职责

- 执行已经准备好的 workflow args，并返回 `outputs[].local_path`。
- 管理 ComfyUI 服务器、模型、workflow、队列、日志和依赖。
- 为 `comfyui-animatool` 执行已确认的 Anima args。
- 不在普通生图前重复查 `help`、模板、schema、目录结构或模型列表。

## 触发场景

用户请求以下 ComfyUI 运维或执行任务时使用本 skill：

| 用户意图                                                                   | 处理方式                                      |
| -------------------------------------------------------------------------- | --------------------------------------------- |
| 释放显存、查看显存/状态、服务器统计                                        | 常用命令：server status/stats                 |
| 列出模型、checkpoint、LoRA、VAE、ControlNet、diffusion model、text encoder | 常用命令：models list                         |
| 导入、启用、禁用、删除、查看 workflow                                      | 常用命令：workflow list/info/import/enable... |
| 执行已准备好的 Anima workflow                                              | 单张`run` / 批量`submit` + `status`           |
| 执行已准备好的非 Anima workflow，例如“跑这个 SDXL/FLUX workflow/工作流”    | 常用命令：run/submit                          |
| 查看、清空、取消队列                                                       | 常用命令：queue list/clear/delete             |
| 查节点、搜索节点、安装依赖、查看日志                                       | 常用命令：nodes/deps/logs                     |
| 连接失败、400、value_not_in_list、模型路径问题                             | 按下方"故障排查"处理                          |

## 读取导航

| 需要处理的事                                   | 读取                            |
| ---------------------------------------------- | ------------------------------- |
| 常规 Anima 执行、workflow 选择、args 格式      | 继续读本文件                    |
| 完整命令大全（所有节点/依赖/日志/配置命令）    | `references/operations.md`      |
| 批量提交脚本模板、详细缓存实现                 | `references/anima-execution.md` |
| 连接失败、400、value_not_in_list、模型路径排查 | `references/troubleshooting.md` |

## 与 Anima skill 的边界

- Anima 生图策略、tag 校验、prompt、画布、steps、批量意图由 `comfyui-animatool` 决定。
- 本 skill 只执行已确定 args，不用临时脚本自行生成 prompt、steps、画布、模型或 filename。
- 默认 Anima 工作流使用 aesthetic LoRA 增强；不要把 LoRA 名写进 prompt。

| 事项                                                                  | 负责 skill                   |
| --------------------------------------------------------------------- | ---------------------------- |
| 判断是否生图、选择普通/随机/批量/Artist Mixer 分支                    | `comfyui-animatool`          |
| 构图、画布、镜头、主体位置、脸部可读性                                | `anima-composition-director` |
| Danbooru 角色、作品、画师、服装、姿势、场景、光影、style anchors 检索 | `danbooru-tags`              |
| prompt、负面词、steps、batch_size、filename 语义来源                  | `comfyui-animatool`          |
| workflow 执行、submit/status、缓存、history、模型/节点/队列/日志      | `comfyui-manager`            |

## CLI 工作区

所有 `comfyui-skill` 命令必须从解析出的 `WORKSPACE` 目录运行。`WORKSPACE` 是包含 `config.json` 和 `data/` 的 `comfyui-manager/workspace` 目录。

不要写死具体用户名或绝对路径。优先使用当前已安装 skill 同目录下的 `workspace`；若不在 skill 目录内，脚本会自动从 CWD 向上搜索 `skills/` 目录树。自动化脚本也可显式设置 `COMFYUI_MANAGER_WORKSPACE`。

PowerShell 兜底解析：

```powershell
function Test-ComfyuiManagerWorkspace($Path) {
  return (Test-Path (Join-Path $Path "config.json")) -and (Test-Path (Join-Path $Path "data"))
}

function Find-ComfyuiManagerWorkspaceFromSkills($Start) {
  $cursor = (Resolve-Path $Start).Path
  while ($cursor) {
    # 优先搜索 skills/ 容器目录（兼容旧结构）
    $skillsDirs = Get-ChildItem -LiteralPath $cursor -Directory -Recurse -Depth 2 -Filter "skills" -ErrorAction SilentlyContinue
    foreach ($skillsDir in $skillsDirs) {
      $candidate = Join-Path $skillsDir.FullName "comfyui-manager\workspace"
      if (Test-ComfyuiManagerWorkspace $candidate) { return (Resolve-Path $candidate).Path }
    }
    # 回退：平铺结构，直接检查当前目录及子目录
    $flatCandidate = Join-Path $cursor "comfyui-manager\workspace"
    if (Test-ComfyuiManagerWorkspace $flatCandidate) { return (Resolve-Path $flatCandidate).Path }
    $parent = Split-Path $cursor -Parent
    if ($parent -eq $cursor) { break }
    $cursor = $parent
  }
  return $null
}

$WORKSPACE = if ($env:COMFYUI_MANAGER_WORKSPACE) {
  $env:COMFYUI_MANAGER_WORKSPACE
} elseif (Test-ComfyuiManagerWorkspace ".\workspace") {
  (Resolve-Path ".\workspace").Path
} elseif (Test-ComfyuiManagerWorkspace ".") {
  (Get-Location).Path
} elseif ($found = Find-ComfyuiManagerWorkspaceFromSkills ".") {
  $found
} else {
  throw "Set COMFYUI_MANAGER_WORKSPACE or run from a directory that can discover skills/comfyui-manager/workspace"
}
```

统一命令前缀：

```powershell
comfyui-skill --dir "$WORKSPACE"
comfyui-skill --json --dir "$WORKSPACE"
```

## PowerShell 与 JSON 编码

JSON 写入默认使用 PowerShell 7 UTF-8 no BOM（`Set-Content -Encoding utf8`）。当前终端不是 PS7 时，用 `pwsh.exe -NoProfile -Command` 启动子进程。只有两种方式都不可用，才退到 PS5 + BOM。禁止不查版本就假设 PS5。

统一写文件片段：

```powershell
function Write-JsonForCli($Path, $Value) {
  $json = $Value | ConvertTo-Json -Depth 30
  if ($PSVersionTable.PSVersion.Major -ge 7) {
    $json | Set-Content -LiteralPath $Path -Encoding utf8
  } else {
    # 最后手段：PS5 必须带 BOM
    $json | Set-Content -LiteralPath $Path -Encoding UTF8
  }
}
```

运行产物不要写入 skill 目录。临时 args、批量 args、输出图片、缓存和历史统一放到：

```powershell
$RUNTIME = if ($env:COMFYUI_MANAGER_RUNTIME_DIR) {
  $env:COMFYUI_MANAGER_RUNTIME_DIR
} elseif ($env:SKILL_RUNTIME_ROOT) {
  Join-Path $env:SKILL_RUNTIME_ROOT "comfyui-manager"
} else {
  try {
    $config = Get-Content -LiteralPath (Join-Path $WORKSPACE "config.json") -Raw | ConvertFrom-Json
    $outputDir = $config.servers[0].output_dir
    if ($outputDir) {
      Split-Path ([System.IO.Path]::GetFullPath((Join-Path $WORKSPACE $outputDir))) -Parent
    } else {
      Join-Path (Resolve-Path (Join-Path $WORKSPACE "..\..")).Path "runtime\comfyui-manager"
    }
  } catch {
    Write-Host "Warning: Could not parse config.json, using fallback runtime path"
    Join-Path (Resolve-Path (Join-Path $WORKSPACE "..\..")).Path "runtime\comfyui-manager"
  }
}
New-Item -ItemType Directory -Force -Path $RUNTIME | Out-Null
```

`workspace/outputs` 和 `workspace/cache` 可以是指向 `$RUNTIME/outputs`、`$RUNTIME/cache` 的 Windows junction，用于 GUI 客户端直接读取本地文件路径或 base64。不要在 workspace 内复制第二份图片；需要本地可访问路径时优先使用这些 junction。

## 默认工作流

| workflow                                          | 使用条件                                      |
| ------------------------------------------------- | --------------------------------------------- |
| `local/anima-txt2img-aesthetic-lora`              | 默认 Anima 文生图                             |
| `local/anima-txt2img-aesthetic-lora-artist-mixer` | 用户明确要求画师串、多画师融合、artist mixer  |
| `local/anima-txt2img-base`                        | 用户明确要求基础版、禁用 LoRA、对比测试或排障 |

## 执行模式选择

`comfyui-animatool` 已产出 args 后，先选执行模式，不要默认把所有任务都用 `run` 阻塞执行。

| 场景                                    | 模式                                               |
| --------------------------------------- | -------------------------------------------------- |
| 单张、用户正在等待最终图片路径          | `run`，阻塞等待完成                                |
| 多 job 串行提交                         | `submit`，记录每个 `prompt_id`，再用 `status` 汇总 |
| 多 job 并行/批量提交                    | `submit`，先全部入队，再轮询 `status`              |
| 同一个 prompt 出 N 张变体               | 设置 `batch_size=N`，只提交 1 个 workflow          |
| 每张图不同 prompt / 随机 tag / 不同画师 | 每张写独立 args，用 `submit` 分别提交              |

单张阻塞执行：

```powershell
Push-Location "$WORKSPACE"
node ./run_workflow_args.js run local/anima-txt2img-aesthetic-lora "$RUNTIME/args/args_anima.json"
Pop-Location
```

画师串 workflow：

```powershell
Push-Location "$WORKSPACE"
node ./run_workflow_args.js run local/anima-txt2img-aesthetic-lora-artist-mixer "$RUNTIME/args/args_anima.json"
Pop-Location
```

执行成功后读取 `outputs[].local_path`。如果失败：

- `connection refused`、`timeout`、`8181`、`8188`、`Cannot connect`、`Failed to connect`：判定为 ComfyUI 连接失败（见 §故障排查）。
- `400`、`Bad Request`、`invalid prompt`、`Prompt outputs failed validation`：读取 `references/troubleshooting.md`。
- 其他运维需求：读取 `references/operations.md`。

## 常用命令速查

```powershell
# 服务器状态
comfyui-skill --json --dir "$WORKSPACE" server status
comfyui-skill --json --dir "$WORKSPACE" server stats

# 模型列表
comfyui-skill --json --dir "$WORKSPACE" models list
comfyui-skill --json --dir "$WORKSPACE" models list loras
comfyui-skill --json --dir "$WORKSPACE" models list diffusion_models
comfyui-skill --json --dir "$WORKSPACE" models list text_encoders
comfyui-skill --json --dir "$WORKSPACE" models list vae

# Workflow
comfyui-skill --json --dir "$WORKSPACE" list
comfyui-skill --json --dir "$WORKSPACE" info local/workflow_id
comfyui-skill --json --dir "$WORKSPACE" workflow import "<path-to-workflow.json>" --check-deps

# 执行
node ./run_workflow_args.js run local/anima-txt2img-aesthetic-lora "$RUNTIME/args/args_anima.json"
node ./run_workflow_args.js submit local/anima-txt2img-aesthetic-lora "$RUNTIME/args/args_anima.json"
comfyui-skill --json --dir "$WORKSPACE" status <prompt_id>
comfyui-skill --json --dir "$WORKSPACE" cancel <prompt_id>

# 队列
comfyui-skill --json --dir "$WORKSPACE" queue list
comfyui-skill --json --dir "$WORKSPACE" queue clear

# 节点与依赖
comfyui-skill --json --dir "$WORKSPACE" nodes search <keyword>
comfyui-skill --json --dir "$WORKSPACE" deps check local/workflow_id
comfyui-skill --json --dir "$WORKSPACE" deps install local/workflow_id --all

# 释放显存
comfyui-skill --dir "$WORKSPACE" free --models
comfyui-skill --dir "$WORKSPACE" free --memory
```

## 故障排查

### 连接失败

`connection refused`、`timeout`、`8181`、`8188`、`Cannot connect`、`Failed to connect`：判定为 ComfyUI 未启动或端口不一致，不要枚举 workflow/schema。让用户启动 ComfyUI 或核对 `workspace/config.json` 的 server URL。

### 400 Bad Request / invalid prompt

处理顺序：

1. 对同一 args 跑 validate，确认不是参数文件格式错误。
2. 跑 `deps check`，确认不是缺节点或缺模型。
3. 读取错误 JSON 中的 `node_errors`、节点名、输入名和 expected choices。
4. 检查 args 是否传了 workflow schema 不接受的字段。
5. 检查枚举值是否完整，例如 `teacache_version` 不能写短值 `v1`。
6. 检查 prompt 字段是否为空或类型不符。
7. 只有确认 ComfyUI 在线且 args 格式正确后，才查看 workflow info。

```powershell
comfyui-skill --json --dir "$WORKSPACE" deps check local/anima-txt2img-aesthetic-lora
comfyui-skill --json --dir "$WORKSPACE" info local/anima-txt2img-aesthetic-lora
```

### value_not_in_list / 模型路径问题

首次在新机器、迁移后的 ComfyUI、重装模型目录后使用 Anima 默认工作流前，检查：

```powershell
comfyui-skill --json --dir "$WORKSPACE" models list diffusion_models
comfyui-skill --json --dir "$WORKSPACE" models list text_encoders
comfyui-skill --json --dir "$WORKSPACE" models list vae
comfyui-skill --json --dir "$WORKSPACE" models list loras
```

重点匹配 AnimaBoosterLoader 的 `model_name`、CLIPLoader 的 `clip_name`、VAELoader 的 `vae_name`、LoraLoaderModelOnly 的 `lora_name`。如果 workflow JSON 里的值不在扫描结果中，需要修正 workflow JSON 后重新导入。

## 执行护栏

- Args 文件必须是纯参数对象，不要包裹 workflow 外壳。
- 默认不传 `rtx_vsr_scale`。
- FLSampler / TeaCache / AnimaBoosterLoader 参数只在用户明确要求调质感、锐度、焦点稳定性或节点级加速时传入。
- 如需传 `teacache_version`，只能用 `v1 (Legacy Fast)` 或 `v2 (Standard Precise)`。
- 队列、缓存、批量执行细则见 `references/anima-execution.md`。
